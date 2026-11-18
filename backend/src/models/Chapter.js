const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    orderIndex: { type: Number, default: 1 },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'chapters' }
);

chapterSchema.index({ userId: 1, subjectId: 1, orderIndex: 1 });

module.exports = mongoose.model('Chapter', chapterSchema);
