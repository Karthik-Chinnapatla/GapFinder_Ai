const express = require('express');
const ChatHistory = require('../models/ChatHistory');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const { requireAuth } = require('../middleware/auth');
const { chatWithAI } = require('../services/aiClient');

const router = express.Router();
router.use(requireAuth);

router.get('/history', async (req, res, next) => {
  try {
    const subjectId = req.query.subjectId || req.user.currentSubjectId;
    if (!subjectId) {
      return res.json({ success: true, messages: [] });
    }
    const messages = await ChatHistory.find({ userId: req.userId, subjectId })
      .sort({ createdAt: 1 })
      .limit(60)
      .lean();
    return res.json({ success: true, messages });
  } catch (err) {
    next(err);
  }
});

router.post('/message', async (req, res, next) => {
  try {
    const { subjectId, message } = req.body || {};
    if (!subjectId || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Subject and message text are required.' });
    }
    const subject = await Subject.findOne({ _id: subjectId, userId: req.userId }).lean();
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }

    const userMsg = await ChatHistory.create({
      userId: req.userId,
      subjectId: subject._id,
      role: 'user',
      message: message.trim(),
      isDemo: Boolean(req.user.isDemo),
    });

    const [weakTopics, recentHistory] = await Promise.all([
      Topic.find({
        userId: req.userId,
        subjectId: subject._id,
        status: { $in: ['critical_weakness', 'needs_improvement'] },
      })
        .sort({ masteryScore: 1 })
        .limit(4)
        .lean(),
      ChatHistory.find({ userId: req.userId, subjectId: subject._id })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    let aiRes;
    try {
      aiRes = await chatWithAI({
        userId: req.userId.toString(),
        subjectId: subject._id.toString(),
        subjectName: subject.name,
        message: message.trim(),
        weakTopics: weakTopics.map((t) => t.name),
        history: recentHistory
          .reverse()
          .map((h) => ({ role: h.role, message: h.message })),
      });
    } catch (aiErr) {
      return res.status(502).json({
        success: false,
        message: aiErr.response?.data?.detail || 'AI Study Assistant service is temporarily unavailable.',
      });
    }

    const assistantMsg = await ChatHistory.create({
      userId: req.userId,
      subjectId: subject._id,
      role: 'assistant',
      message: aiRes.reply,
      grounded: Boolean(aiRes.grounded),
      citations: aiRes.citations || [],
      relatedTopics: aiRes.relatedTopics || [],
      isDemo: Boolean(req.user.isDemo),
    });

    return res.json({
      success: true,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      aiMode: aiRes.aiMode,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/history', async (req, res, next) => {
  try {
    const subjectId = req.query.subjectId || req.user.currentSubjectId;
    if (subjectId) {
      await ChatHistory.deleteMany({ userId: req.userId, subjectId });
    }
    return res.json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
