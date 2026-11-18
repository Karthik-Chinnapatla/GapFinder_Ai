const mongoose = require('mongoose');

const revisionPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: '' },
    generatedAt: { type: Date, default: Date.now },
    lastUpdatedAt: { type: Date, default: Date.now },
    overallProgress: { type: Number, min: 0, max: 100, default: 0 },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'revisionplans' }
);

revisionPlanSchema.index({ userId: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('RevisionPlan', revisionPlanSchema);
