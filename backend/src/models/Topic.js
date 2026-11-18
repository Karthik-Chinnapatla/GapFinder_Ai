const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 800, default: '' },
    keyConcepts: [{ type: String, trim: true }],
    masteryScore: { type: Number, min: 0, max: 100, default: null },
    status: {
      type: String,
      enum: ['insufficient_data', 'critical_weakness', 'needs_improvement', 'developing', 'mastered'],
      default: 'insufficient_data',
    },
    totalAttempts: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    repeatedMistakes: [
      {
        concept: { type: String, required: true },
        count: { type: Number, default: 1 },
        lastSeenAt: { type: Date, default: Date.now },
      },
    ],
    diagnosisReason: { type: String, default: '' },
    lastAssessedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'topics' }
);

topicSchema.index({ userId: 1, subjectId: 1, chapterId: 1 });
topicSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Topic', topicSchema);
