const mongoose = require('mongoose');

const topicPerformanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', default: null },
    recordedAt: { type: Date, default: Date.now, index: true },
    masteryScore: { type: Number, min: 0, max: 100, default: null },
    accuracy: { type: Number, min: 0, max: 100, default: 0 },
    difficultyWeightedScore: { type: Number, min: 0, max: 100, default: 0 },
    questionsAttempted: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['insufficient_data', 'critical_weakness', 'needs_improvement', 'developing', 'mastered'],
      default: 'insufficient_data',
    },
    weaknessReason: { type: String, default: '' },
    misconceptions: [{ type: String }],
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'topicperformances' }
);

topicPerformanceSchema.index({ userId: 1, subjectId: 1, topicId: 1, recordedAt: 1 });

module.exports = mongoose.model('TopicPerformance', topicPerformanceSchema);
