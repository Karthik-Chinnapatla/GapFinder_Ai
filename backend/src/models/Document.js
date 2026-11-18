const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', default: null, index: true },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, default: 'text/plain' },
    fileType: { type: String, enum: ['pdf', 'docx', 'txt'], required: true },
    fileSize: { type: Number, default: 0 },
    docCategory: {
      type: String,
      enum: ['textbook', 'notes', 'syllabus', 'question_paper'],
      default: 'notes',
    },
    processingStatus: {
      type: String,
      enum: ['uploaded', 'processing', 'indexed', 'failed'],
      default: 'uploaded',
      index: true,
    },
    errorMessage: { type: String, default: '' },
    pageCount: { type: Number, default: null },
    chunkCount: { type: Number, default: 0 },
    extractedCharCount: { type: Number, default: 0 },
    previewText: { type: String, default: '' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'documents' }
);

documentSchema.index({ userId: 1, subjectId: 1, createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
