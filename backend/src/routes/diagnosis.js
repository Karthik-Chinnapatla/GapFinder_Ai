const express = require('express');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const Subject = require('../models/Subject');
const TopicPerformance = require('../models/TopicPerformance');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function resolveSubjectId(req) {
  if (req.query.subjectId) return req.query.subjectId;
  if (req.user.currentSubjectId) return req.user.currentSubjectId;
  const first = await Subject.findOne({ userId: req.userId }).sort({ createdAt: 1 }).lean();
  return first?._id || null;
}

router.get('/report', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    if (!subjectId) {
      return res.json({
        success: true,
        subject: null,
        thresholds: req.user.thresholds,
        topics: [],
        buckets: {
          critical_weakness: [],
          needs_improvement: [],
          developing: [],
          mastered: [],
          insufficient_data: [],
        },
        summary: {
          overallMastery: null,
          totalTopics: 0,
          diagnosedTopics: 0,
          criticalCount: 0,
          needsImprovementCount: 0,
          developingCount: 0,
          masteredCount: 0,
          insufficientCount: 0,
        },
      });
    }

    const [subject, chapters, topics, history] = await Promise.all([
      Subject.findOne({ _id: subjectId, userId: req.userId }).lean(),
      Chapter.find({ userId: req.userId, subjectId }).lean(),
      Topic.find({ userId: req.userId, subjectId }).sort({ createdAt: 1 }).lean(),
      TopicPerformance.find({ userId: req.userId, subjectId }).sort({ recordedAt: 1 }).lean(),
    ]);

    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }

    const chapterMap = new Map(chapters.map((c) => [c._id.toString(), c]));
    const histByTopic = new Map();
    history.forEach((h) => {
      const tid = h.topicId.toString();
      if (!histByTopic.has(tid)) histByTopic.set(tid, []);
      histByTopic.get(tid).push(h);
    });

    const enriched = topics.map((t) => {
      const tid = t._id.toString();
      const tHist = histByTopic.get(tid) || [];
      const validScores = tHist.filter((x) => x.masteryScore !== null).map((x) => x.masteryScore);
      const trendDelta = validScores.length >= 2 ? validScores[validScores.length - 1] - validScores[0] : 0;
      const accuracy = t.totalAttempts > 0 ? Math.round((t.correctCount / t.totalAttempts) * 100) : null;
      const ch = chapterMap.get(t.chapterId?.toString() || '');

      return {
        ...t,
        chapterTitle: ch?.title || '',
        chapterOrder: ch?.orderIndex || 0,
        accuracy,
        trendDelta,
        scoreHistory: validScores,
      };
    });

    // Sort diagnostic table by urgency: critical -> needs_improvement -> developing -> insufficient -> mastered
    const rank = {
      critical_weakness: 0,
      needs_improvement: 1,
      developing: 2,
      insufficient_data: 3,
      mastered: 4,
    };
    enriched.sort((a, b) => {
      const rDiff = (rank[a.status] ?? 5) - (rank[b.status] ?? 5);
      if (rDiff !== 0) return rDiff;
      return (a.masteryScore ?? 999) - (b.masteryScore ?? 999);
    });

    const buckets = {
      critical_weakness: enriched.filter((t) => t.status === 'critical_weakness'),
      needs_improvement: enriched.filter((t) => t.status === 'needs_improvement'),
      developing: enriched.filter((t) => t.status === 'developing'),
      mastered: enriched.filter((t) => t.status === 'mastered'),
      insufficient_data: enriched.filter((t) => t.status === 'insufficient_data'),
    };

    const diagnosed = enriched.filter((t) => t.status !== 'insufficient_data' && t.masteryScore !== null);
    const overallMastery =
      diagnosed.length > 0
        ? Math.round(diagnosed.reduce((acc, t) => acc + t.masteryScore, 0) / diagnosed.length)
        : null;

    return res.json({
      success: true,
      subject,
      thresholds: req.user.thresholds,
      topics: enriched,
      buckets,
      summary: {
        overallMastery,
        totalTopics: enriched.length,
        diagnosedTopics: diagnosed.length,
        criticalCount: buckets.critical_weakness.length,
        needsImprovementCount: buckets.needs_improvement.length,
        developingCount: buckets.developing.length,
        masteredCount: buckets.mastered.length,
        insufficientCount: buckets.insufficient_data.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/weak-topics', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    const filter = {
      userId: req.userId,
      status: { $in: ['critical_weakness', 'needs_improvement'] },
    };
    if (subjectId) filter.subjectId = subjectId;
    const topics = await Topic.find(filter).sort({ masteryScore: 1 }).lean();
    return res.json({ success: true, topics });
  } catch (err) {
    next(err);
  }
});

router.get('/strong-topics', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    const filter = { userId: req.userId, status: 'mastered' };
    if (subjectId) filter.subjectId = subjectId;
    const topics = await Topic.find(filter).sort({ masteryScore: -1 }).lean();
    return res.json({ success: true, topics });
  } catch (err) {
    next(err);
  }
});

router.get('/mastery', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    const filter = { userId: req.userId };
    if (subjectId) filter.subjectId = subjectId;
    const topics = await Topic.find(filter, {
      name: 1,
      masteryScore: 1,
      status: 1,
      totalAttempts: 1,
      correctCount: 1,
      incorrectCount: 1,
      diagnosisReason: 1,
    }).lean();
    return res.json({ success: true, topics });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
