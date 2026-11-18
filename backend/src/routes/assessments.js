const express = require('express');
const Assessment = require('../models/Assessment');
const Question = require('../models/Question');
const StudentAnswer = require('../models/StudentAnswer');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const DocumentChunk = require('../models/DocumentChunk');
const { requireAuth } = require('../middleware/auth');
const { generateQuestionsInAI, evaluateAnswerInAI } = require('../services/aiClient');
const { recalculateTopicDiagnosis } = require('../services/diagnosisEngine');
const { syncRevisionPlanForSubject } = require('../services/revisionEngine');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));

    const assessments = await Assessment.find(filter)
      .populate('subjectId', 'name code')
      .populate('topicIds', 'name masteryScore status')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, assessments });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const {
      subjectId,
      chapterIds = [],
      topicIds = [],
      difficulty = 'medium',
      questionCount = 5,
      questionTypes = ['mcq', 'true_false', 'short_answer', 'conceptual'],
      timeLimitMinutes = null,
      title,
    } = req.body || {};

    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Subject is required.' });
    }
    const subject = await Subject.findOne({ _id: subjectId, userId: req.userId });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }

    const chunkCount = await DocumentChunk.countDocuments({ userId: req.userId, subjectId: subject._id });
    if (chunkCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No indexed study materials found for this subject. Please upload and index study documents first.',
      });
    }

    // Resolve target topics
    const topicFilter = { userId: req.userId, subjectId: subject._id };
    if (Array.isArray(topicIds) && topicIds.length > 0) {
      topicFilter._id = { $in: topicIds };
    } else if (Array.isArray(chapterIds) && chapterIds.length > 0) {
      topicFilter.chapterId = { $in: chapterIds };
    }
    const topics = await Topic.find(topicFilter).lean();
    if (topics.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please add at least one topic to your syllabus before generating an assessment.',
      });
    }

    const chapters = await Chapter.find({ userId: req.userId, subjectId: subject._id }).lean();
    const chapterMap = new Map(chapters.map((c) => [c._id.toString(), c.title]));

    const count = Math.min(15, Math.max(2, Number(questionCount) || 5));
    const aiPayload = {
      userId: req.userId.toString(),
      subjectId: subject._id.toString(),
      topics: topics.map((t) => ({
        topicId: t._id.toString(),
        topicName: t.name,
        chapterId: t.chapterId ? t.chapterId.toString() : null,
        chapterTitle: chapterMap.get(t.chapterId?.toString() || '') || '',
        description: t.description || '',
        masteryScore: t.masteryScore,
      })),
      questionCount: count,
      difficulty,
      questionTypes: Array.isArray(questionTypes) && questionTypes.length > 0 ? questionTypes : ['mcq', 'true_false'],
    };

    let aiResponse;
    try {
      aiResponse = await generateQuestionsInAI(aiPayload);
    } catch (aiErr) {
      const msg = aiErr.response?.data?.detail || aiErr.message || 'AI question generation failed.';
      return res.status(502).json({ success: false, message: msg });
    }

    const generated = aiResponse.questions || [];
    if (generated.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Could not generate grounded questions from the retrieved materials.',
      });
    }

    const assessmentTitle =
      (title && title.trim()) ||
      (topics.length === 1
        ? `${topics[0].name} — Targeted Diagnostic Quiz`
        : `${subject.name} — RAG Diagnostic Assessment (${topics.length} Topics)`);

    const assessment = await Assessment.create({
      userId: req.userId,
      subjectId: subject._id,
      chapterIds: Array.from(new Set(topics.map((t) => t.chapterId).filter(Boolean))),
      topicIds: topics.map((t) => t._id),
      title: assessmentTitle,
      difficulty,
      questionTypes: aiPayload.questionTypes,
      questionCount: generated.length,
      totalQuestions: generated.length,
      timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
      status: 'in_progress',
      startedAt: new Date(),
      isDemo: Boolean(req.user.isDemo),
    });

    const questionDocs = generated.map((q, idx) => ({
      userId: req.userId,
      assessmentId: assessment._id,
      subjectId: subject._id,
      chapterId: q.chapterId || null,
      topicId: q.topicId,
      topicName: q.topicName,
      questionIndex: idx + 1,
      questionType: q.questionType,
      difficulty: q.difficulty || 'medium',
      prompt: q.prompt,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      expectedKeywords: q.expectedKeywords || [],
      explanation: q.explanation,
      misconceptionTrap: q.misconceptionTrap || '',
      sourceCitation: q.sourceCitation || {},
      isDemo: Boolean(req.user.isDemo),
    }));

    const createdQuestions = await Question.insertMany(questionDocs);

    return res.status(201).json({
      success: true,
      assessment,
      aiMode: aiResponse.aiMode,
      retrievedChunksUsed: aiResponse.retrievedChunksUsed,
      questions: createdQuestions.map((q) => ({
        _id: q._id,
        questionIndex: q.questionIndex,
        topicId: q.topicId,
        topicName: q.topicName,
        questionType: q.questionType,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        sourceCitation: {
          documentName: q.sourceCitation?.documentName || '',
          chapterTitle: q.sourceCitation?.chapterTitle || '',
          pageNumber: q.sourceCitation?.pageNumber ?? null,
          sectionTitle: q.sourceCitation?.sectionTitle || '',
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const assessment = await Assessment.findOne({ _id: req.params.id, userId: req.userId })
      .populate('subjectId', 'name code')
      .lean();
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    const questions = await Question.find({ assessmentId: assessment._id, userId: req.userId })
      .sort({ questionIndex: 1 })
      .lean();

    if (assessment.status !== 'completed') {
      const safeQuestions = questions.map((q) => ({
        _id: q._id,
        questionIndex: q.questionIndex,
        topicId: q.topicId,
        topicName: q.topicName,
        questionType: q.questionType,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        sourceCitation: {
          documentName: q.sourceCitation?.documentName || '',
          chapterTitle: q.sourceCitation?.chapterTitle || '',
          pageNumber: q.sourceCitation?.pageNumber ?? null,
          sectionTitle: q.sourceCitation?.sectionTitle || '',
        },
      }));
      return res.json({ success: true, assessment, questions: safeQuestions, answers: [] });
    }

    const answers = await StudentAnswer.find({ assessmentId: assessment._id, userId: req.userId }).lean();
    const ansMap = new Map(answers.map((a) => [a.questionId.toString(), a]));

    const reviewed = questions.map((q) => ({
      ...q,
      studentAnswer: ansMap.get(q._id.toString()) || null,
    }));

    return res.json({ success: true, assessment, questions: reviewed, answers });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', async (req, res, next) => {
  try {
    const { answers = [], timeSpentSeconds = 0 } = req.body || {};
    const assessment = await Assessment.findOne({ _id: req.params.id, userId: req.userId });
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }
    if (assessment.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This assessment has already been submitted.' });
    }

    const questions = await Question.find({ assessmentId: assessment._id, userId: req.userId })
      .sort({ questionIndex: 1 })
      .lean();

    const submittedMap = new Map(
      (Array.isArray(answers) ? answers : []).map((a) => [String(a.questionId), String(a.selectedAnswer ?? '')])
    );

    const savedAnswers = [];
    let earnedTotal = 0;
    let correctCount = 0;
    const topicPerformanceMap = new Map();
    const misconceptions = [];

    for (const q of questions) {
      const selectedAnswer = submittedMap.get(q._id.toString()) || '';
      let evaluation;
      try {
        evaluation = await evaluateAnswerInAI({ question: q, selectedAnswer });
      } catch (_err) {
        // Fallback deterministic evaluation if AI service is momentarily busy
        const isCorrect = selectedAnswer.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
        evaluation = {
          isCorrect,
          partialScore: isCorrect ? 1 : 0,
          aiFeedback: isCorrect ? `Correct! ${q.explanation}` : `Expected: ${q.correctAnswer}. ${q.explanation}`,
          identifiedMisconception: isCorrect ? '' : q.misconceptionTrap || `Conceptual gap in ${q.topicName}`,
        };
      }

      if (evaluation.isCorrect) correctCount += 1;
      earnedTotal += typeof evaluation.partialScore === 'number' ? evaluation.partialScore : evaluation.isCorrect ? 1 : 0;
      if (evaluation.identifiedMisconception) {
        misconceptions.push(evaluation.identifiedMisconception);
      }

      const saved = await StudentAnswer.findOneAndUpdate(
        { assessmentId: assessment._id, questionId: q._id },
        {
          $set: {
            userId: req.userId,
            assessmentId: assessment._id,
            questionId: q._id,
            subjectId: assessment.subjectId,
            topicId: q.topicId,
            selectedAnswer,
            isCorrect: Boolean(evaluation.isCorrect),
            partialScore: Number(evaluation.partialScore ?? (evaluation.isCorrect ? 1 : 0)),
            aiFeedback: evaluation.aiFeedback || '',
            identifiedMisconception: evaluation.identifiedMisconception || '',
            citation: {
              documentName: q.sourceCitation?.documentName || '',
              chapterTitle: q.sourceCitation?.chapterTitle || '',
              pageNumber: q.sourceCitation?.pageNumber ?? null,
              sectionTitle: q.sourceCitation?.sectionTitle || '',
              excerpt: q.sourceCitation?.excerpt || '',
            },
            isDemo: Boolean(req.user.isDemo),
          },
        },
        { upsert: true, new: true }
      );
      savedAnswers.push(saved);

      const tKey = q.topicId.toString();
      const bucket = topicPerformanceMap.get(tKey) || { topicId: q.topicId, topicName: q.topicName, correct: 0, total: 0 };
      bucket.total += 1;
      if (evaluation.isCorrect) bucket.correct += 1;
      topicPerformanceMap.set(tKey, bucket);
    }

    const scorePercentage = questions.length > 0 ? Math.round((earnedTotal / questions.length) * 100) : 0;

    // Recalculate topic-level mastery, record historical snapshot, and dynamically update revision plan
    const affectedTopicIds = Array.from(topicPerformanceMap.keys());
    const updatedTopics = [];
    for (const tid of affectedTopicIds) {
      const u = await recalculateTopicDiagnosis(
        req.userId,
        tid,
        req.user.thresholds,
        assessment._id,
        true
      );
      if (u) updatedTopics.push(u);
    }

    const weakTopicNames = updatedTopics
      .filter((t) => ['critical_weakness', 'needs_improvement'].includes(t.status))
      .map((t) => t.name);
    const strongTopicNames = updatedTopics.filter((t) => t.status === 'mastered').map((t) => t.name);

    assessment.status = 'completed';
    assessment.scorePercentage = scorePercentage;
    assessment.correctCount = correctCount;
    assessment.totalQuestions = questions.length;
    assessment.completedAt = new Date();
    assessment.timeSpentSeconds = Number(timeSpentSeconds) || 0;
    assessment.diagnosticSummary = {
      weakTopicNames,
      strongTopicNames,
      keyMisconceptions: Array.from(new Set(misconceptions)).slice(0, 5),
      summaryText:
        weakTopicNames.length > 0
          ? `Scored ${scorePercentage}% (${correctCount}/${questions.length}). Priority knowledge gaps detected in: ${weakTopicNames.join(', ')}. Your personalized revision plan has been updated automatically.`
          : `Scored ${scorePercentage}% (${correctCount}/${questions.length}). Strong performance across tested topics!`,
    };
    await assessment.save();

    const revisionUpdate = await syncRevisionPlanForSubject(req.userId, assessment.subjectId, req.user.isDemo);

    const ansMap = new Map(savedAnswers.map((a) => [a.questionId.toString(), a]));
    const reviewedQuestions = questions.map((q) => ({
      ...q,
      studentAnswer: ansMap.get(q._id.toString()) || null,
    }));

    return res.json({
      success: true,
      assessment,
      questions: reviewedQuestions,
      updatedTopics,
      revisionPlanUpdated: Boolean(revisionUpdate),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
