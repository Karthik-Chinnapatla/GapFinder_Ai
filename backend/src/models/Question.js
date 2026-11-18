const mongoose = require('mongoose');

const citationSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    documentName: { type: String, default: '' },
    chapterTitle: { type: String, default: '' },
    pageNumber: { type: Number, default: null },
    sectionTitle: { type: String, default: '' },
    chunkId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentChunk', default: null },
    excerpt: { type: String, default: '' },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chapter', default: null },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    topicName: { type: String, required: true },
    questionIndex: { type: Number, required: true },
    questionType: {
      type: String,
      enum: ['mcq', 'true_false', 'short_answer', 'conceptual'],
      required: true,
    },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    prompt: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true },
    expectedKeywords: [{ type: String }],
    explanation: { type: String, required: true },
    misconceptionTrap: { type: String, default: '' },
    sourceCitation: { type: citationSchema, default: () => ({}) },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'questions' }
);

questionSchema.index({ assessmentId: 1, questionIndex: 1 });

module.exports = mongoose.model('Question', questionSchema);
