const express = require('express');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Document = require('../models/Document');
const Question = require('../models/Question');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Full syllabus tree for a subject
router.get('/syllabus/:subjectId', async (req, res, next) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.subjectId, userId: req.userId }).lean();
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }

    const [chapters, topics, documents, questionCounts] = await Promise.all([
      Chapter.find({ userId: req.userId, subjectId: subject._id }).sort({ orderIndex: 1, createdAt: 1 }).lean(),
      Topic.find({ userId: req.userId, subjectId: subject._id }).sort({ createdAt: 1 }).lean(),
      Document.find({ userId: req.userId, subjectId: subject._id }).sort({ createdAt: -1 }).lean(),
      Question.aggregate([
        { $match: { userId: req.userId, subjectId: subject._id } },
        { $group: { _id: '$topicId', count: { $sum: 1 } } },
      ]),
    ]);

    const qCountMap = new Map(questionCounts.map((q) => [q._id.toString(), q.count]));

    const structuredChapters = chapters.map((ch) => {
      const chId = ch._id.toString();
      const chDocs = documents.filter((d) => d.chapterId?.toString() === chId);
      const chTopics = topics
        .filter((t) => t.chapterId?.toString() === chId)
        .map((t) => ({
          ...t,
          relatedDocuments: chDocs.map((d) => ({
            _id: d._id,
            originalName: d.originalName,
            processingStatus: d.processingStatus,
            docCategory: d.docCategory,
          })),
          questionCount: qCountMap.get(t._id.toString()) || 0,
        }));

      const diagnosed = chTopics.filter((t) => t.masteryScore !== null && t.status !== 'insufficient_data');
      const chapterMastery =
        diagnosed.length > 0
          ? Math.round(diagnosed.reduce((a, b) => a + b.masteryScore, 0) / diagnosed.length)
          : null;

      return {
        ...ch,
        documents: chDocs,
        topics: chTopics,
        chapterMastery,
      };
    });

    const unmappedDocuments = documents.filter((d) => !d.chapterId);

    return res.json({
      success: true,
      subject,
      chapters: structuredChapters,
      unmappedDocuments,
      summary: {
        totalChapters: chapters.length,
        totalTopics: topics.length,
        totalDocuments: documents.length,
        indexedDocuments: documents.filter((d) => d.processingStatus === 'indexed').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Chapters CRUD
router.post('/chapters', async (req, res, next) => {
  try {
    const { subjectId, title, description, orderIndex } = req.body || {};
    if (!subjectId || !title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Subject and chapter title are required.' });
    }
    const subject = await Subject.findOne({ _id: subjectId, userId: req.userId });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }
    const count = await Chapter.countDocuments({ userId: req.userId, subjectId });
    const chapter = await Chapter.create({
      userId: req.userId,
      subjectId,
      title: title.trim(),
      description: (description || '').trim(),
      orderIndex: orderIndex ? Number(orderIndex) : count + 1,
      isDemo: Boolean(req.user.isDemo),
    });
    return res.status(201).json({ success: true, chapter });
  } catch (err) {
    next(err);
  }
});

router.put('/chapters/:id', async (req, res, next) => {
  try {
    const { title, description, orderIndex } = req.body || {};
    const chapter = await Chapter.findOne({ _id: req.params.id, userId: req.userId });
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found.' });
    }
    if (title && title.trim()) chapter.title = title.trim();
    if (description !== undefined) chapter.description = String(description).trim();
    if (orderIndex !== undefined) chapter.orderIndex = Number(orderIndex);
    await chapter.save();
    return res.json({ success: true, chapter });
  } catch (err) {
    next(err);
  }
});

router.delete('/chapters/:id', async (req, res, next) => {
  try {
    const chapter = await Chapter.findOne({ _id: req.params.id, userId: req.userId });
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found.' });
    }
    await Promise.all([
      Chapter.deleteOne({ _id: chapter._id, userId: req.userId }),
      Topic.deleteMany({ chapterId: chapter._id, userId: req.userId }),
      Document.updateMany({ chapterId: chapter._id, userId: req.userId }, { $set: { chapterId: null } }),
    ]);
    return res.json({ success: true, message: 'Chapter deleted.' });
  } catch (err) {
    next(err);
  }
});

// Topics CRUD
router.get('/topics', async (req, res, next) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    if (req.query.chapterId) filter.chapterId = req.query.chapterId;

    const topics = await Topic.find(filter).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, topics });
  } catch (err) {
    next(err);
  }
});

router.post('/topics', async (req, res, next) => {
  try {
    const { subjectId, chapterId, name, description, keyConcepts } = req.body || {};
    if (!subjectId || !chapterId || !name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Subject, chapter, and topic name are required.' });
    }
    const chapter = await Chapter.findOne({ _id: chapterId, subjectId, userId: req.userId });
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found for this subject.' });
    }
    const topic = await Topic.create({
      userId: req.userId,
      subjectId,
      chapterId,
      name: name.trim(),
      description: (description || '').trim(),
      keyConcepts: Array.isArray(keyConcepts) ? keyConcepts.filter(Boolean) : [],
      status: 'insufficient_data',
      masteryScore: null,
      diagnosisReason: `Insufficient evidence to diagnose ${name.trim()} yet. Complete a targeted assessment to evaluate mastery.`,
      isDemo: Boolean(req.user.isDemo),
    });
    return res.status(201).json({ success: true, topic });
  } catch (err) {
    next(err);
  }
});

router.put('/topics/:id', async (req, res, next) => {
  try {
    const { name, description, chapterId, keyConcepts } = req.body || {};
    const topic = await Topic.findOne({ _id: req.params.id, userId: req.userId });
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found.' });
    }
    if (name && name.trim()) topic.name = name.trim();
    if (description !== undefined) topic.description = String(description).trim();
    if (chapterId) {
      const ch = await Chapter.findOne({ _id: chapterId, subjectId: topic.subjectId, userId: req.userId });
      if (ch) topic.chapterId = ch._id;
    }
    if (Array.isArray(keyConcepts)) topic.keyConcepts = keyConcepts.filter(Boolean);
    await topic.save();
    return res.json({ success: true, topic });
  } catch (err) {
    next(err);
  }
});

router.delete('/topics/:id', async (req, res, next) => {
  try {
    const topic = await Topic.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found.' });
    }
    return res.json({ success: true, message: 'Topic deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
