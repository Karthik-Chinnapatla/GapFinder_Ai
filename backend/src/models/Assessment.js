const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    chapterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chapter' }],
    topicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    title: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', 'adaptive'], default: 'medium' },
    questionTypes: [{ type: String, enum: ['mcq', 'true_false', 'short_answer', 'conceptual'] }],
    questionCount: { type: Number, required: true, min: 1, max: 30 },
    timeLimitMinutes: { type: Number, default: null },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress', index: true },
    scorePercentage: { type: Number, default: null },
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    timeSpentSeconds: { type: Number, default: 0 },
    diagnosticSummary: {
      weakTopicNames: [{ type: String }],
      strongTopicNames: [{ type: String }],
      keyMisconceptions: [{ type: String }],
      summaryText: { type: String, default: '' },
    },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'assessments' }
);

assessmentSchema.index({ userId: 1, subjectId: 1, createdAt: -1 });

module.exports = mongoose.model('Assessment', assessmentSchema);
