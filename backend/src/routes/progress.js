const express = require('express');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const Assessment = require('../models/Assessment');
const TopicPerformance = require('../models/TopicPerformance');
const RevisionTask = require('../models/RevisionTask');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function resolveSubjectId(req) {
  if (req.query.subjectId) return req.query.subjectId;
  if (req.user.currentSubjectId) return req.user.currentSubjectId;
  const first = await Subject.findOne({ userId: req.userId }).sort({ createdAt: 1 }).lean();
  return first?._id || null;
}

router.get('/overview', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    if (!subjectId) {
      return res.json({
        success: true,
        subject: null,
        overallMastery: null,
        revisionCompletionPct: 0,
        topicTrajectories: [],
        assessmentTrends: [],
        improvedTopics: [],
        newlyMasteredTopics: [],
        previouslyWeakTopics: [],
      });
    }

    const [subject, topics, assessments, perfHistory, revTasks] = await Promise.all([
      Subject.findOne({ _id: subjectId, userId: req.userId }).lean(),
      Topic.find({ userId: req.userId, subjectId }).sort({ createdAt: 1 }).lean(),
      Assessment.find({ userId: req.userId, subjectId, status: 'completed' }).sort({ completedAt: 1 }).lean(),
      TopicPerformance.find({ userId: req.userId, subjectId }).sort({ recordedAt: 1 }).lean(),
      RevisionTask.find({ userId: req.userId, subjectId }).lean(),
    ]);

    const diagnosed = topics.filter((t) => t.masteryScore !== null && t.status !== 'insufficient_data');
    const overallMastery =
      diagnosed.length > 0
        ? Math.round(diagnosed.reduce((acc, t) => acc + t.masteryScore, 0) / diagnosed.length)
        : null;

    const completedRev = revTasks.filter((t) => t.status === 'completed').length;
    const revisionCompletionPct = revTasks.length > 0 ? Math.round((completedRev / revTasks.length) * 100) : 0;

    // Group performance snapshots per topic
    const perfByTopic = new Map();
    perfHistory.forEach((p) => {
      const tid = p.topicId.toString();
      if (!perfByTopic.has(tid)) perfByTopic.set(tid, []);
      perfByTopic.get(tid).push(p);
    });

    const topicTrajectories = topics.map((t) => {
      const snaps = (perfByTopic.get(t._id.toString()) || []).filter((s) => s.masteryScore !== null);
      const scores = snaps.map((s) => ({
        date: s.recordedAt,
        score: s.masteryScore,
        status: s.status,
      }));
      const firstScore = scores.length > 0 ? scores[0].score : t.masteryScore;
      const latestScore = scores.length > 0 ? scores[scores.length - 1].score : t.masteryScore;
      const delta = firstScore !== null && latestScore !== null ? latestScore - firstScore : 0;
      const wasWeak = snaps.some((s) => ['critical_weakness', 'needs_improvement'].includes(s.status));

      return {
        topicId: t._id,
        topicName: t.name,
        currentMastery: t.masteryScore,
        status: t.status,
        totalAttempts: t.totalAttempts,
        firstScore,
        latestScore,
        delta,
        wasWeak,
        trajectory: scores,
      };
    });

    const improvedTopics = topicTrajectories
      .filter((t) => t.delta >= 5)
      .sort((a, b) => b.delta - a.delta);

    const newlyMasteredTopics = topicTrajectories.filter(
      (t) => t.status === 'mastered' && (t.wasWeak || t.delta > 0)
    );

    const previouslyWeakTopics = topicTrajectories.filter(
      (t) => t.wasWeak && !['critical_weakness', 'needs_improvement'].includes(t.status)
    );

    const assessmentTrends = assessments.map((a, idx) => ({
      id: a._id,
      label: `Quiz #${idx + 1}`,
      title: a.title,
      date: a.completedAt || a.createdAt,
      score: a.scorePercentage ?? 0,
      correctCount: a.correctCount,
      totalQuestions: a.totalQuestions,
      difficulty: a.difficulty,
    }));

    return res.json({
      success: true,
      subject,
      overallMastery,
      revisionCompletionPct,
      completedRevisionTasks: completedRev,
      totalRevisionTasks: revTasks.length,
      topicTrajectories,
      assessmentTrends,
      improvedTopics,
      newlyMasteredTopics,
      previouslyWeakTopics,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/topics/:topicId', async (req, res, next) => {
  try {
    const topic = await Topic.findOne({ _id: req.params.topicId, userId: req.userId }).lean();
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found.' });
    }
    const history = await TopicPerformance.find({ userId: req.userId, topicId: topic._id })
      .sort({ recordedAt: 1 })
      .lean();
    return res.json({ success: true, topic, history });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
