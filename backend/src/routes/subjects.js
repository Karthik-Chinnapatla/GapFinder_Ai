const express = require('express');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const Assessment = require('../models/Assessment');
const Question = require('../models/Question');
const StudentAnswer = require('../models/StudentAnswer');
const TopicPerformance = require('../models/TopicPerformance');
const RevisionPlan = require('../models/RevisionPlan');
const RevisionTask = require('../models/RevisionTask');
const ChatHistory = require('../models/ChatHistory');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const subjects = await Subject.find({ userId: req.userId }).sort({ createdAt: 1 }).lean();
    const enriched = await Promise.all(
      subjects.map(async (s) => {
        const [chapterCount, topics, docCount, assessmentCount] = await Promise.all([
          Chapter.countDocuments({ userId: req.userId, subjectId: s._id }),
          Topic.find({ userId: req.userId, subjectId: s._id }).lean(),
          Document.countDocuments({ userId: req.userId, subjectId: s._id }),
          Assessment.countDocuments({ userId: req.userId, subjectId: s._id, status: 'completed' }),
        ]);

        const diagnosed = topics.filter((t) => t.masteryScore !== null && t.status !== 'insufficient_data');
        const avgMastery =
          diagnosed.length > 0
            ? Math.round(diagnosed.reduce((acc, t) => acc + t.masteryScore, 0) / diagnosed.length)
            : null;
        const weakCount = topics.filter((t) => ['critical_weakness', 'needs_improvement'].includes(t.status)).length;
        const masteredCount = topics.filter((t) => t.status === 'mastered').length;

        return {
          ...s,
          chapterCount,
          topicCount: topics.length,
          documentCount: docCount,
          assessmentCount,
          avgMastery,
          weakCount,
          masteredCount,
        };
      })
    );
    return res.json({ success: true, subjects: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, code, description, color } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Subject name is required.' });
    }
    const subject = await Subject.create({
      userId: req.userId,
      name: name.trim(),
      code: (code || '').trim(),
      description: (description || '').trim(),
      color: color || '#4F46E5',
      isDemo: Boolean(req.user.isDemo),
    });

    if (!req.user.currentSubjectId) {
      req.user.currentSubjectId = subject._id;
      await req.user.save();
    }

    return res.status(201).json({ success: true, subject });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, code, description, color } = req.body || {};
    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }
    if (name && name.trim()) subject.name = name.trim();
    if (code !== undefined) subject.code = String(code).trim();
    if (description !== undefined) subject.description = String(description).trim();
    if (color) subject.color = color;
    await subject.save();
    return res.json({ success: true, subject });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }
    const sid = subject._id;
    await Promise.all([
      Subject.deleteOne({ _id: sid, userId: req.userId }),
      Chapter.deleteMany({ subjectId: sid, userId: req.userId }),
      Topic.deleteMany({ subjectId: sid, userId: req.userId }),
      Document.deleteMany({ subjectId: sid, userId: req.userId }),
      DocumentChunk.deleteMany({ subjectId: sid, userId: req.userId }),
      Assessment.deleteMany({ subjectId: sid, userId: req.userId }),
      Question.deleteMany({ subjectId: sid, userId: req.userId }),
      StudentAnswer.deleteMany({ subjectId: sid, userId: req.userId }),
      TopicPerformance.deleteMany({ subjectId: sid, userId: req.userId }),
      RevisionPlan.deleteMany({ subjectId: sid, userId: req.userId }),
      RevisionTask.deleteMany({ subjectId: sid, userId: req.userId }),
      ChatHistory.deleteMany({ subjectId: sid, userId: req.userId }),
    ]);

    if (req.user.currentSubjectId?.toString() === sid.toString()) {
      const nextSubj = await Subject.findOne({ userId: req.userId }).sort({ createdAt: 1 });
      req.user.currentSubjectId = nextSubj?._id || null;
      await req.user.save();
    }

    return res.json({ success: true, message: 'Subject and associated records deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
