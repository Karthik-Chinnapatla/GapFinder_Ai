const express = require('express');
const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { indexDocumentInAI, semanticSearchInAI } = require('../services/aiClient');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    if (req.query.chapterId) filter.chapterId = req.query.chapterId;

    const documents = await Document.find(filter)
      .populate('subjectId', 'name code')
      .populate('chapterId', 'title orderIndex')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, documents });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please attach a PDF, DOCX, or TXT file.' });
    }
    const { subjectId, chapterId, docCategory } = req.body || {};
    if (!subjectId) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: 'Please select a subject for this study material.' });
    }

    const subject = await Subject.findOne({ _id: subjectId, userId: req.userId });
    if (!subject) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }

    let chapter = null;
    if (chapterId) {
      chapter = await Chapter.findOne({ _id: chapterId, subjectId, userId: req.userId });
    }

    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const doc = await Document.create({
      userId: req.userId,
      subjectId: subject._id,
      chapterId: chapter ? chapter._id : null,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      fileType: ext,
      fileSize: req.file.size,
      docCategory: ['textbook', 'notes', 'syllabus', 'question_paper'].includes(docCategory) ? docCategory : 'notes',
      processingStatus: 'uploaded',
      isDemo: Boolean(req.user.isDemo),
    });

    // Trigger Python RAG indexing pipeline immediately and return updated indexed document
    try {
      await indexDocumentInAI({
        documentId: doc._id.toString(),
        userId: req.userId.toString(),
        subjectId: subject._id.toString(),
        chapterId: chapter ? chapter._id.toString() : null,
        chapterTitle: chapter ? chapter.title : '',
        documentName: doc.originalName,
        filePath: doc.filePath,
        fileType: doc.fileType,
        isDemo: Boolean(req.user.isDemo),
      });
    } catch (aiErr) {
      const msg = aiErr.response?.data?.detail || aiErr.message || 'AI RAG indexing failed.';
      await Document.updateOne(
        { _id: doc._id },
        { $set: { processingStatus: 'failed', errorMessage: msg } }
      );
    }

    const refreshed = await Document.findById(doc._id)
      .populate('subjectId', 'name code')
      .populate('chapterId', 'title orderIndex')
      .lean();

    return res.status(201).json({
      success: true,
      document: refreshed,
      message:
        refreshed.processingStatus === 'indexed'
          ? `Uploaded and indexed into ${refreshed.chunkCount} semantic chunks.`
          : `Uploaded, but indexing status is: ${refreshed.processingStatus}.`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/search', async (req, res, next) => {
  try {
    const { subjectId, query, topK, chapterId } = req.body || {};
    if (!subjectId || !query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Subject and search query are required.' });
    }
    const subject = await Subject.findOne({ _id: subjectId, userId: req.userId });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }
    const data = await semanticSearchInAI({
      userId: req.userId.toString(),
      subjectId: subject._id.toString(),
      query: query.trim(),
      topK: Math.min(12, Math.max(1, Number(topK) || 5)),
      chapterId: chapterId || null,
    });
    return res.json({ success: true, results: data.results || [] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.userId })
      .populate('subjectId', 'name code')
      .populate('chapterId', 'title orderIndex')
      .lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const chunks = await DocumentChunk.find(
      { documentId: doc._id, userId: req.userId },
      { embedding: 0 }
    )
      .sort({ chunkIndex: 1 })
      .limit(50)
      .lean();

    return res.json({ success: true, document: doc, chunks });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/status', async (req, res, next) => {
  try {
    const doc = await Document.findOne(
      { _id: req.params.id, userId: req.userId },
      { processingStatus: 1, chunkCount: 1, pageCount: 1, errorMessage: 1 }
    ).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.json({ success: true, status: doc });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/map-chapter', async (req, res, next) => {
  try {
    const { chapterId } = req.body || {};
    const doc = await Document.findOne({ _id: req.params.id, userId: req.userId });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    let chapterTitle = '';
    if (chapterId) {
      const ch = await Chapter.findOne({ _id: chapterId, subjectId: doc.subjectId, userId: req.userId });
      if (!ch) return res.status(404).json({ success: false, message: 'Chapter not found.' });
      doc.chapterId = ch._id;
      chapterTitle = ch.title;
    } else {
      doc.chapterId = null;
    }
    await doc.save();
    await DocumentChunk.updateMany(
      { documentId: doc._id, userId: req.userId },
      { $set: { chapterId: doc.chapterId, chapterTitle } }
    );
    return res.json({ success: true, document: doc });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reindex', async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.userId }).populate('chapterId', 'title');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    await indexDocumentInAI({
      documentId: doc._id.toString(),
      userId: req.userId.toString(),
      subjectId: doc.subjectId.toString(),
      chapterId: doc.chapterId ? doc.chapterId._id.toString() : null,
      chapterTitle: doc.chapterId ? doc.chapterId.title : '',
      documentName: doc.originalName,
      filePath: doc.filePath,
      fileType: doc.fileType,
      isDemo: Boolean(doc.isDemo),
    });
    const refreshed = await Document.findById(doc._id)
      .populate('subjectId', 'name code')
      .populate('chapterId', 'title orderIndex')
      .lean();
    return res.json({ success: true, document: refreshed });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.userId });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    await Promise.all([
      Document.deleteOne({ _id: doc._id, userId: req.userId }),
      DocumentChunk.deleteMany({ documentId: doc._id, userId: req.userId }),
    ]);
    if (doc.filePath && fs.existsSync(doc.filePath) && !doc.isDemo) {
      fs.unlink(doc.filePath, () => {});
    }
    return res.json({ success: true, message: 'Study material and its indexed embeddings deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
