const express = require('express');
const RevisionPlan = require('../models/RevisionPlan');
const RevisionTask = require('../models/RevisionTask');
const Subject = require('../models/Subject');
const { requireAuth } = require('../middleware/auth');
const { syncRevisionPlanForSubject } = require('../services/revisionEngine');

const router = express.Router();
router.use(requireAuth);

async function resolveSubjectId(req) {
  if (req.query.subjectId) return req.query.subjectId;
  if (req.body?.subjectId) return req.body.subjectId;
  if (req.user.currentSubjectId) return req.user.currentSubjectId;
  const first = await Subject.findOne({ userId: req.userId }).sort({ createdAt: 1 }).lean();
  return first?._id || null;
}

router.get('/plan', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    if (!subjectId) {
      return res.json({ success: true, plan: null, tasks: [] });
    }
    const plan = await RevisionPlan.findOne({ userId: req.userId, subjectId }).lean();
    if (!plan) {
      const generated = await syncRevisionPlanForSubject(req.userId, subjectId, req.user.isDemo);
      return res.json({
        success: true,
        plan: generated?.plan || null,
        tasks: generated?.tasks || [],
      });
    }

    const tasks = await RevisionTask.find({ userId: req.userId, planId: plan._id }).lean();
    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      return (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4);
    });

    return res.json({ success: true, plan, tasks });
  } catch (err) {
    next(err);
  }
});

router.post('/plan/generate', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Please create or select a subject first.' });
    }
    const result = await syncRevisionPlanForSubject(req.userId, subjectId, req.user.isDemo);
    return res.json({
      success: true,
      message: 'Revision plan synchronized with latest diagnostic results.',
      plan: result?.plan || null,
      tasks: result?.tasks || [],
    });
  } catch (err) {
    next(err);
  }
});

router.post('/plan/refresh', async (req, res, next) => {
  try {
    const subjectId = await resolveSubjectId(req);
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Subject is required.' });
    }
    const result = await syncRevisionPlanForSubject(req.userId, subjectId, req.user.isDemo);
    return res.json({
      success: true,
      message: 'Revision recommendations refreshed while preserving completed tasks.',
      plan: result?.plan || null,
      tasks: result?.tasks || [],
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/tasks/:taskId', async (req, res, next) => {
  try {
    const { status, activities } = req.body || {};
    const task = await RevisionTask.findOne({ _id: req.params.taskId, userId: req.userId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Revision task not found.' });
    }

    if (Array.isArray(activities)) {
      task.activities = activities.map((a) => ({ label: String(a.label), done: Boolean(a.done) }));
      const allDone = task.activities.length > 0 && task.activities.every((a) => a.done);
      const someDone = task.activities.some((a) => a.done);
      if (!status) {
        task.status = allDone ? 'completed' : someDone ? 'in_progress' : 'pending';
        task.completedAt = allDone ? new Date() : null;
      }
    }

    if (status && ['pending', 'in_progress', 'completed'].includes(status)) {
      task.status = status;
      task.completedAt = status === 'completed' ? new Date() : null;
      if (status === 'completed' && !Array.isArray(activities)) {
        task.activities = task.activities.map((a) => ({ label: a.label, done: true }));
      }
    }

    await task.save();

    // Update parent plan overallProgress
    const allTasks = await RevisionTask.find({ userId: req.userId, planId: task.planId }).lean();
    const completed = allTasks.filter((t) => t.status === 'completed').length;
    const progress = allTasks.length > 0 ? Math.round((completed / allTasks.length) * 100) : 0;
    const plan = await RevisionPlan.findByIdAndUpdate(
      task.planId,
      { $set: { overallProgress: progress, lastUpdatedAt: new Date() } },
      { new: true }
    );

    return res.json({ success: true, task, plan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
