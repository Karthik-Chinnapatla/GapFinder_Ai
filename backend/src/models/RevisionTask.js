const mongoose = require('mongoose');

const revisionTaskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'RevisionPlan', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    topicName: { type: String, required: true },
    priority: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium', index: true },
    reason: { type: String, required: true },
    recommendedMaterial: {
      documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
      documentName: { type: String, default: '' },
      chapterTitle: { type: String, default: '' },
      sectionRef: { type: String, default: '' },
    },
    suggestedDurationMinutes: { type: Number, default: 30 },
    activities: [
      {
        label: { type: String, required: true },
        done: { type: Boolean, default: false },
      },
    ],
    status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending', index: true },
    completedAt: { type: Date, default: null },
    currentMastery: { type: Number, default: null },
    targetMastery: { type: Number, default: 80 },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'revisiontasks' }
);

revisionTaskSchema.index({ userId: 1, planId: 1, status: 1 });

module.exports = mongoose.model('RevisionTask', revisionTaskSchema);
