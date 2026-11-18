const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const UPLOAD_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), 'gapfinder_uploads')
  : path.resolve(__dirname, '../../uploads');

if (!IS_SERVERLESS && !fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXTS = new Set(['.pdf', '.docx', '.txt']);

function buildStoredFilename(req, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const safeBase = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);
  const userPrefix = req.userId ? req.userId.toString().slice(-6) : 'anon';
  return `${userPrefix}_${Date.now()}_${safeBase}${ext}`;
}

const storage = IS_SERVERLESS
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => cb(null, buildStoredFilename(req, file.originalname)),
    });

const upload = multer({
  storage,
  limits: {
    fileSize: IS_SERVERLESS ? 4 * 1024 * 1024 : 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return cb(new Error('Unsupported file format. Please upload PDF, DOCX, or TXT files.'));
    }
    cb(null, true);
  },
});

module.exports = { upload, UPLOAD_DIR, IS_SERVERLESS, buildStoredFilename };
