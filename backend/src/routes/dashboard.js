const express = require('express');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Document = require('../models/Document');
const Assessment = require('../models/Assessment');
const RevisionTask = require('../models/RevisionTask');
const RevisionPlan = require('../models/RevisionPlan');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const subjects = await Subject.find({ userId: req.userId }).sort({ createdAt: 1 }).lean();

    let activeSubject = null;
    if (req.query.subjectId) {
      activeSubject = subjects.find((s) => s._id.toString() === String(req.query.subjectId)) || null;
    }
    if (!activeSubject && req.user.currentSubjectId) {
      activeSubject = subjects.find((s) => s._id.toString() === req.user.currentSubjectId.toString()) || null;
    }
    if (!activeSubject && subjects.length > 0) {
      activeSubject = subjects[0];
    }

    const totalSubjects = subjects.length;

    if (!activeSubject) {
      return res.json({
        success: true,
        student: req.user.toSafeJSON(),
        activeSubject: null,
        subjects: [],
        stats: {
          totalSubjects: 0,
          topicsStudied: 0,
          totalTopics: 0,
          topicsMastered: 0,
          weakTopics: 0,
          assessmentsCompleted: 0,
          indexedDocuments: 0,
          overallKnowledgeScore: null,
        },
        topicPerformance: [],
        statusDistribution: [],
        weakestTopics: [],
        strongTopics: [],
        upcomingRevisionTasks: [],
        recentAssessments: [],
        progressTrend: [],
        recommendedAction: {
          type: 'create_subject',
          title: 'Create your first subject & syllabus',
          description: 'Add a subject and upload your notes, syllabus, or textbook PDFs so GapFinder AI can map and diagnose your knowledge gaps.',
          ctaLabel: 'Set Up Syllabus',
          ctaPath: '/syllabus',
        },
      });
    }

    const sid = activeSubject._id;
    const [chapters, topics, documents, assessments, revisionPlan, revisionTasks] = await Promise.all([
      Chapter.find({ userId: req.userId, subjectId: sid }).sort({ orderIndex: 1 }).lean(),
      Topic.find({ userId: req.userId, subjectId: sid }).sort({ createdAt: 1 }).lean(),
      Document.find({ userId: req.userId, subjectId: sid }).lean(),
      Assessment.find({ userId: req.userId, subjectId: sid, status: 'completed' })
        .sort({ completedAt: 1 })
        .lean(),
      RevisionPlan.findOne({ userId: req.userId, subjectId: sid }).lean(),
      RevisionTask.find({ userId: req.userId, subjectId: sid }).lean(),
    ]);

    const chapterMap = new Map(chapters.map((c) => [c._id.toString(), c.title]));
    const diagnosedTopics = topics.filter((t) => t.status !== 'insufficient_data' && t.masteryScore !== null);
    const topicsStudied = topics.filter((t) => t.totalAttempts > 0).length;
    const topicsMastered = topics.filter((t) => t.status === 'mastered').length;
    const weakTopicList = topics
      .filter((t) => ['critical_weakness', 'needs_improvement'].includes(t.status))
      .sort((a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0));
    const strongTopicList = topics
      .filter((t) => t.status === 'mastered')
      .sort((a, b) => (b.masteryScore ?? 0) - (a.masteryScore ?? 0));

    const overallKnowledgeScore =
      diagnosedTopics.length > 0
        ? Math.round(diagnosedTopics.reduce((acc, t) => acc + t.masteryScore, 0) / diagnosedTopics.length)
        : null;

    const indexedDocuments = documents.filter((d) => d.processingStatus === 'indexed').length;

    const topicPerformance = topics.map((t) => ({
      topicId: t._id,
      topicName: t.name,
      chapterTitle: chapterMap.get(t.chapterId?.toString() || '') || '',
      masteryScore: t.masteryScore ?? 0,
      hasData: t.masteryScore !== null,
      status: t.status,
      totalAttempts: t.totalAttempts,
      correctCount: t.correctCount,
      incorrectCount: t.incorrectCount,
      diagnosisReason: t.diagnosisReason,
      repeatedMistakes: t.repeatedMistakes || [],
    }));

    const statusDistribution = [
      { key: 'mastered', label: 'Mastered', count: topics.filter((t) => t.status === 'mastered').length, color: '#059669' },
      { key: 'developing', label: 'Developing', count: topics.filter((t) => t.status === 'developing').length, color: '#4F46E5' },
      { key: 'needs_improvement', label: 'Needs Improvement', count: topics.filter((t) => t.status === 'needs_improvement').length, color: '#D97706' },
      { key: 'critical_weakness', label: 'Critical Weakness', count: topics.filter((t) => t.status === 'critical_weakness').length, color: '#DC2626' },
      { key: 'insufficient_data', label: 'Needs Data', count: topics.filter((t) => t.status === 'insufficient_data').length, color: '#9CA3AF' },
    ];

    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    const upcomingRevisionTasks = revisionTasks
      .filter((t) => t.status !== 'completed')
      .sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4))
      .slice(0, 5);

    const recentAssessments = [...assessments]
      .reverse()
      .slice(0, 5)
      .map((a) => ({
        _id: a._id,
        title: a.title,
        scorePercentage: a.scorePercentage,
        correctCount: a.correctCount,
        totalQuestions: a.totalQuestions,
        difficulty: a.difficulty,
        completedAt: a.completedAt,
        weakTopicNames: a.diagnosticSummary?.weakTopicNames || [],
      }));

    const progressTrend = assessments.map((a, idx) => ({
      name: `Quiz ${idx + 1}`,
      title: a.title,
      score: a.scorePercentage ?? 0,
      date: a.completedAt,
    }));

    // Smart Recommended Next Action derived from live DB state
    let recommendedAction;
    if (indexedDocuments === 0) {
      recommendedAction = {
        type: 'upload_material',
        title: `Upload study materials for ${activeSubject.name}`,
        description: 'Upload PDF textbooks, lecture notes, or past question papers so the RAG engine can index and ground assessments.',
        ctaLabel: 'Upload Materials',
        ctaPath: '/materials',
      };
    } else if (weakTopicList.length > 0) {
      const topWeak = weakTopicList[0];
      recommendedAction = {
        type: 'fix_weak_topic',
        title: `Close critical gap: ${topWeak.name} (${topWeak.masteryScore}%)`,
        description: topWeak.diagnosisReason,
        topicId: topWeak._id,
        ctaLabel: `Practice ${topWeak.name}`,
        ctaPath: `/assessments?topicId=${topWeak._id}`,
      };
    } else if (assessments.length === 0) {
      recommendedAction = {
        type: 'first_assessment',
        title: `Run your first diagnostic assessment in ${activeSubject.name}`,
        description: 'Discover which syllabus concepts you truly know and where hidden blind spots exist.',
        ctaLabel: 'Generate RAG Quiz',
        ctaPath: '/assessments',
      };
    } else {
      const untested = topics.find((t) => t.status === 'insufficient_data');
      recommendedAction = untested
        ? {
            type: 'assess_untested',
            title: `Assess untested topic: ${untested.name}`,
            description: `${untested.name} currently has insufficient diagnostic data. Take a quick quiz to map your baseline mastery.`,
            topicId: untested._id,
            ctaLabel: `Diagnose ${untested.name}`,
            ctaPath: `/assessments?topicId=${untested._id}`,
          }
        : {
            type: 'reinforce',
            title: 'Take an adaptive mastery check',
            description: 'Keep reinforcing your developing topics and verify long-term retention across chapters.',
            ctaLabel: 'Start Adaptive Quiz',
            ctaPath: '/assessments',
          };
    }

    return res.json({
      success: true,
      student: req.user.toSafeJSON(),
      activeSubject,
      subjects,
      stats: {
        totalSubjects,
        topicsStudied,
        totalTopics: topics.length,
        topicsMastered,
        weakTopics: weakTopicList.length,
        assessmentsCompleted: assessments.length,
        indexedDocuments,
        overallKnowledgeScore,
        revisionProgress: revisionPlan?.overallProgress ?? 0,
      },
      topicPerformance,
      statusDistribution,
      weakestTopics: weakTopicList.slice(0, 4).map((t) => ({
        ...t,
        chapterTitle: chapterMap.get(t.chapterId?.toString() || '') || '',
      })),
      strongTopics: strongTopicList.slice(0, 4),
      upcomingRevisionTasks,
      recentAssessments,
      progressTrend,
      recommendedAction,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
