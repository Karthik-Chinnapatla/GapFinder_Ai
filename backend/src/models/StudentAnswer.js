const mongoose = require('mongoose');

const studentAnswerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    selectedAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, required: true },
    partialScore: { type: Number, min: 0, max: 1, default: 0 },
    aiFeedback: { type: String, default: '' },
    identifiedMisconception: { type: String, default: '' },
    timeSpentSeconds: { type: Number, default: 0 },
    citation: {
      documentName: { type: String, default: '' },
      chapterTitle: { type: String, default: '' },
      pageNumber: { type: Number, default: null },
      sectionTitle: { type: String, default: '' },
      excerpt: { type: String, default: '' },
    },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'studentanswers' }
);

studentAnswerSchema.index({ userId: 1, topicId: 1, createdAt: -1 });
studentAnswerSchema.index({ assessmentId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('StudentAnswer', studentAnswerSchema);
