const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    message: { type: String, required: true },
    grounded: { type: Boolean, default: true },
    citations: [
      {
        documentId: { type: String, default: '' },
        documentName: { type: String, default: '' },
        chapterTitle: { type: String, default: '' },
        pageNumber: { type: Number, default: null },
        sectionTitle: { type: String, default: '' },
        excerpt: { type: String, default: '' },
        relevanceScore: { type: Number, default: 0 },
      },
    ],
    relatedTopics: [{ type: String }],
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'chathistories' }
);

chatHistorySchema.index({ userId: 1, subjectId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
