const Topic = require('../models/Topic');
const StudentAnswer = require('../models/StudentAnswer');
const Question = require('../models/Question');
const TopicPerformance = require('../models/TopicPerformance');

const DIFFICULTY_WEIGHT = {
  easy: 0.85,
  medium: 1.0,
  hard: 1.25,
};

function classifyStatus(masteryScore, totalAttempts, thresholds = {}) {
  const criticalMax = thresholds.criticalMax ?? 39;
  const needsImprovementMax = thresholds.needsImprovementMax ?? 59;
  const developingMax = thresholds.developingMax ?? 79;
  const minAttempts = thresholds.minAttemptsForDiagnosis ?? 3;

  if (totalAttempts < minAttempts || masteryScore === null) {
    return 'insufficient_data';
  }
  if (masteryScore <= criticalMax) return 'critical_weakness';
  if (masteryScore <= needsImprovementMax) return 'needs_improvement';
  if (masteryScore <= developingMax) return 'developing';
  return 'mastered';
}

function buildDiagnosisReason(topicName, status, stats, repeatedMistakes, minAttempts) {
  const { totalAttempts, correctCount, incorrectCount, accuracy, masteryScore, delta } = stats;

  if (status === 'insufficient_data') {
    return `Insufficient evidence to diagnose ${topicName} reliably (${totalAttempts} of ${minAttempts} minimum questions attempted). Complete a short targeted assessment to gather enough diagnostic signal.`;
  }

  const topMistakes = repeatedMistakes
    .slice(0, 2)
    .map((m) => `"${m.concept}" (${m.count}x)`)
    .join(' and ');

  if (status === 'critical_weakness') {
    const mistakeClause = topMistakes
      ? ` and repeatedly struggled with ${topMistakes}`
      : ` with ${incorrectCount} incorrect responses across core concepts`;
    return `${topicName} is a critical weakness because you answered only ${correctCount} out of ${totalAttempts} questions correctly (${accuracy}% accuracy)${mistakeClause}.`;
  }

  if (status === 'needs_improvement') {
    const mistakeClause = topMistakes
      ? `. Recurring conceptual gap: ${topMistakes}`
      : `. Reinforce foundational definitions and edge cases before harder problems`;
    return `${topicName} needs improvement (${masteryScore}% mastery, ${correctCount}/${totalAttempts} correct)${mistakeClause}.`;
  }

  if (status === 'developing') {
    const trendClause =
      delta !== null && delta >= 8
        ? ` — strong upward improvement (+${delta} pts from your baseline)`
        : '';
    const mistakeClause = topMistakes ? `, though you still occasionally slip on ${topMistakes}` : '';
    return `${topicName} is developing steadily (${masteryScore}% mastery, ${correctCount}/${totalAttempts} correct)${trendClause}${mistakeClause}.`;
  }

  return `${topicName} is mastered (${masteryScore}% mastery, ${correctCount}/${totalAttempts} correct) with consistent accuracy across assessments.`;
}

/**
 * Recomputes mastery score, repeated mistakes, weakness explanation, and status
 * for a single topic from actual persisted StudentAnswer records.
 */
async function recalculateTopicDiagnosis(userId, topicId, userThresholds = {}, assessmentId = null, recordSnapshot = false) {
  const topic = await Topic.findOne({ _id: topicId, userId });
  if (!topic) return null;

  const answers = await StudentAnswer.find({ userId, topicId })
    .sort({ createdAt: 1 })
    .lean();

  const totalAttempts = answers.length;
  const minAttempts = userThresholds.minAttemptsForDiagnosis ?? 3;

  if (totalAttempts === 0) {
    topic.masteryScore = null;
    topic.status = 'insufficient_data';
    topic.totalAttempts = 0;
    topic.correctCount = 0;
    topic.incorrectCount = 0;
    topic.repeatedMistakes = [];
    topic.diagnosisReason = buildDiagnosisReason(topic.name, 'insufficient_data', { totalAttempts: 0 }, [], minAttempts);
    await topic.save();
    return topic;
  }

  const questionIds = answers.map((a) => a.questionId);
  const questions = await Question.find({ _id: { $in: questionIds } }).lean();
  const qMap = new Map(questions.map((q) => [q._id.toString(), q]));

  let weightedEarned = 0;
  let weightedPossible = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  const mistakeMap = new Map();

  answers.forEach((ans, idx) => {
    const q = qMap.get(ans.questionId.toString());
    const diffW = DIFFICULTY_WEIGHT[q?.difficulty || 'medium'] || 1.0;
    // Recency weighting: recent attempts carry higher diagnostic weight so improvement shows clearly
    const recencyW = totalAttempts === 1 ? 1.0 : 0.72 + 0.56 * (idx / (totalAttempts - 1));
    const weight = diffW * recencyW;

    const earned = typeof ans.partialScore === 'number' ? ans.partialScore : ans.isCorrect ? 1 : 0;
    weightedEarned += earned * weight;
    weightedPossible += weight;

    if (ans.isCorrect) {
      correctCount += 1;
    } else {
      incorrectCount += 1;
      const concept = (ans.identifiedMisconception || q?.misconceptionTrap || '').trim();
      if (concept) {
        const prev = mistakeMap.get(concept) || { concept, count: 0, lastSeenAt: ans.createdAt };
        prev.count += 1;
        prev.lastSeenAt = ans.createdAt || new Date();
        mistakeMap.set(concept, prev);
      }
    }
  });

  const repeatedMistakes = Array.from(mistakeMap.values()).sort((a, b) => b.count - a.count);
  const repeatedPenalty = repeatedMistakes.reduce((acc, m) => acc + (m.count >= 2 ? Math.min(5, (m.count - 1) * 3) : 0), 0);

  const rawWeightedPct = weightedPossible > 0 ? (weightedEarned / weightedPossible) * 100 : 0;
  const masteryScore = Math.max(0, Math.min(100, Math.round(rawWeightedPct - Math.min(10, repeatedPenalty))));
  const accuracy = Math.round((correctCount / totalAttempts) * 100);
  const status = classifyStatus(masteryScore, totalAttempts, userThresholds);

  // Check historical delta for richer diagnosis explanation
  const earliestPerf = await TopicPerformance.findOne({ userId, topicId, masteryScore: { $ne: null } })
    .sort({ recordedAt: 1 })
    .lean();
  const delta = earliestPerf ? masteryScore - earliestPerf.masteryScore : null;

  const diagnosisReason = buildDiagnosisReason(
    topic.name,
    status,
    { totalAttempts, correctCount, incorrectCount, accuracy, masteryScore, delta },
    repeatedMistakes,
    minAttempts
  );

  topic.masteryScore = masteryScore;
  topic.status = status;
  topic.totalAttempts = totalAttempts;
  topic.correctCount = correctCount;
  topic.incorrectCount = incorrectCount;
  topic.repeatedMistakes = repeatedMistakes.slice(0, 6);
  topic.diagnosisReason = diagnosisReason;
  topic.lastAssessedAt = answers[answers.length - 1].createdAt || new Date();
  await topic.save();

  if (recordSnapshot) {
    await TopicPerformance.create({
      userId,
      subjectId: topic.subjectId,
      topicId: topic._id,
      assessmentId,
      recordedAt: new Date(),
      masteryScore,
      accuracy,
      difficultyWeightedScore: Math.round(rawWeightedPct),
      questionsAttempted: totalAttempts,
      correctCount,
      incorrectCount,
      status,
      weaknessReason: diagnosisReason,
      misconceptions: repeatedMistakes.slice(0, 4).map((m) => m.concept),
      isDemo: Boolean(topic.isDemo),
    });
  }

  return topic;
}

async function recalculateSubjectDiagnosis(userId, subjectId, userThresholds = {}) {
  const topics = await Topic.find({ userId, subjectId }).lean();
  const updated = [];
  for (const t of topics) {
    const u = await recalculateTopicDiagnosis(userId, t._id, userThresholds, null, false);
    if (u) updated.push(u);
  }
  return updated;
}

module.exports = {
  classifyStatus,
  recalculateTopicDiagnosis,
  recalculateSubjectDiagnosis,
};
