const mongoose = require('mongoose');

const documentChunkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', default: null, index: true },
    topicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    chunkIndex: { type: Number, required: true },
    pageNumber: { type: Number, default: null },
    sectionTitle: { type: String, default: '' },
    documentName: { type: String, default: '' },
    chapterTitle: { type: String, default: '' },
    content: { type: String, required: true },
    tokenCount: { type: Number, default: 0 },
    embedding: { type: [Number], default: [] },
    embeddingModel: { type: String, default: 'local-hybrid-384' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'documentchunks' }
);

documentChunkSchema.index({ userId: 1, subjectId: 1, documentId: 1, chunkIndex: 1 });

module.exports = mongoose.model('DocumentChunk', documentChunkSchema);
