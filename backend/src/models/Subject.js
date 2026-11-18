const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    code: { type: String, trim: true, maxlength: 32, default: '' },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    color: { type: String, default: '#4F46E5' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'subjects' }
);

subjectSchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Subject', subjectSchema);
