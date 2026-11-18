const RevisionPlan = require('../models/RevisionPlan');
const RevisionTask = require('../models/RevisionTask');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const Document = require('../models/Document');
const Subject = require('../models/Subject');

function priorityForTopic(topic) {
  const repeatedCount = (topic.repeatedMistakes || []).reduce((acc, m) => acc + (m.count >= 2 ? 1 : 0), 0);
  if (topic.status === 'critical_weakness') return 'critical';
  if (topic.status === 'needs_improvement' || repeatedCount >= 2) return 'high';
  if (topic.status === 'developing' && (topic.masteryScore ?? 0) < 72) return 'medium';
  if (topic.status === 'developing') return 'low';
  return null;
}

function durationForPriority(priority) {
  switch (priority) {
    case 'critical':
      return 45;
    case 'high':
      return 35;
    case 'medium':
      return 25;
    default:
      return 15;
  }
}

function buildActivities(topic, chapterTitle, docName) {
  const topMistake = topic.repeatedMistakes?.[0]?.concept;
  const activities = [];
  if (docName) {
    activities.push({
      label: `Review ${chapterTitle ? `${chapterTitle} in ` : ''}"${docName}"`,
      done: false,
    });
  } else if (chapterTitle) {
    activities.push({
      label: `Review core notes for ${chapterTitle} — ${topic.name}`,
      done: false,
    });
  }
  if (topMistake) {
    activities.push({
      label: `Resolve recurring misconception: ${topMistake}`,
      done: false,
    });
  } else {
    activities.push({
      label: `Summarize key properties and edge cases of ${topic.name}`,
      done: false,
    });
  }
  activities.push({
    label: `Complete ${topic.status === 'critical_weakness' ? 6 : 5} RAG practice questions on ${topic.name}`,
    done: false,
  });
  activities.push({
    label: `Retake a targeted ${topic.name} assessment to reach >= 80% mastery`,
    done: false,
  });
  return activities;
}

/**
 * Intelligently synchronizes the student's personalized Revision Plan for a subject.
 * - Preserves all completed tasks (never regenerates destructively).
 * - Updates priorities/reasons of active tasks as performance shifts.
 * - Marks active tasks completed automatically if a topic reaches Mastered (>= 80%).
 * - Creates targeted tasks for newly identified weak or developing topics.
 */
async function syncRevisionPlanForSubject(userId, subjectId, isDemo = false) {
  const subject = await Subject.findOne({ _id: subjectId, userId });
  if (!subject) return null;

  const [topics, chapters, documents] = await Promise.all([
    Topic.find({ userId, subjectId }).lean(),
    Chapter.find({ userId, subjectId }).lean(),
    Document.find({ userId, subjectId, processingStatus: 'indexed' }).lean(),
  ]);

  const chapterMap = new Map(chapters.map((c) => [c._id.toString(), c]));
  const docByChapter = new Map();
  documents.forEach((d) => {
    if (d.chapterId) docByChapter.set(d.chapterId.toString(), d);
  });
  const fallbackDoc = documents[0] || null;

  let plan = await RevisionPlan.findOne({ userId, subjectId });
  if (!plan) {
    plan = await RevisionPlan.create({
      userId,
      subjectId,
      title: `${subject.name} — Personalized Gap-Closure Plan`,
      summary: 'Dynamically prioritized from your topic-level diagnostic results.',
      generatedAt: new Date(),
      lastUpdatedAt: new Date(),
      overallProgress: 0,
      isDemo,
    });
  }

  const existingTasks = await RevisionTask.find({ userId, planId: plan._id });
  const activeTaskByTopic = new Map();
  existingTasks.forEach((task) => {
    if (task.status !== 'completed') {
      activeTaskByTopic.set(task.topicId.toString(), task);
    }
  });

  for (const topic of topics) {
    const tid = topic._id.toString();
    const activeTask = activeTaskByTopic.get(tid);
    const priority = priorityForTopic(topic);
    const chapter = chapterMap.get(topic.chapterId?.toString() || '');
    const linkedDoc = docByChapter.get(topic.chapterId?.toString() || '') || fallbackDoc;

    // If topic is now mastered, automatically complete any outstanding task for it
    if (topic.status === 'mastered') {
      if (activeTask) {
        activeTask.status = 'completed';
        activeTask.completedAt = new Date();
        activeTask.currentMastery = topic.masteryScore;
        activeTask.activities = activeTask.activities.map((a) => ({ ...a.toObject(), done: true }));
        await activeTask.save();
      }
      continue;
    }

    // Do not fabricate revision tasks for topics with insufficient diagnostic evidence
    if (!priority) {
      continue;
    }

    const materialRef = {
      documentId: linkedDoc?._id || null,
      documentName: linkedDoc?.originalName || '',
      chapterTitle: chapter?.title || '',
      sectionRef: chapter ? `Chapter ${chapter.orderIndex}: ${chapter.title}` : topic.name,
    };

    const reasonText =
      topic.diagnosisReason ||
      `${topic.name} currently has ${topic.masteryScore ?? 0}% mastery and requires targeted revision.`;

    if (activeTask) {
      // Intelligently update existing open task without erasing student's checked progress
      activeTask.priority = priority;
      activeTask.reason = reasonText;
      activeTask.currentMastery = topic.masteryScore;
      activeTask.suggestedDurationMinutes = durationForPriority(priority);
      activeTask.recommendedMaterial = materialRef;
      await activeTask.save();
    } else {
      await RevisionTask.create({
        userId,
        planId: plan._id,
        subjectId,
        topicId: topic._id,
        topicName: topic.name,
        priority,
        reason: reasonText,
        recommendedMaterial: materialRef,
        suggestedDurationMinutes: durationForPriority(priority),
        activities: buildActivities(topic, chapter?.title || '', linkedDoc?.originalName || ''),
        status: 'pending',
        currentMastery: topic.masteryScore,
        targetMastery: 80,
        isDemo: Boolean(topic.isDemo || isDemo),
      });
    }
  }

  // Recompute plan summary & overall progress
  const allTasks = await RevisionTask.find({ userId, planId: plan._id }).lean();
  const completedCount = allTasks.filter((t) => t.status === 'completed').length;
  const criticalCount = allTasks.filter((t) => t.status !== 'completed' && t.priority === 'critical').length;
  const highCount = allTasks.filter((t) => t.status !== 'completed' && t.priority === 'high').length;

  plan.overallProgress = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 100;
  plan.lastUpdatedAt = new Date();
  plan.summary =
    criticalCount > 0
      ? `${criticalCount} critical gap${criticalCount > 1 ? 's' : ''} and ${highCount} high-priority topic${highCount !== 1 ? 's' : ''} queued for immediate revision.`
      : highCount > 0
      ? `${highCount} weak topic${highCount > 1 ? 's' : ''} prioritized to lift your mastery above 80%.`
      : allTasks.length === 0
      ? 'Take an assessment to unlock personalized revision recommendations.'
      : 'Great momentum — finish remaining reinforcement tasks to lock in mastery.';
  await plan.save();

  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  allTasks.sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4);
  });

  return { plan, tasks: allTasks };
}

module.exports = { syncRevisionPlanForSubject };
