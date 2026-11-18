require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { connectDB } = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');
const { checkAiHealth } = require('./services/aiClient');

const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const syllabusRoutes = require('./routes/syllabus');
const documentRoutes = require('./routes/documents');
const assessmentRoutes = require('./routes/assessments');
const diagnosisRoutes = require('./routes/diagnosis');
const revisionRoutes = require('./routes/revision');
const progressRoutes = require('./routes/progress');
const chatRoutes = require('./routes/chat');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(cleanOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Ensure MongoDB connection is ready on every request (critical for Vercel serverless)
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'gapfinder-backend',
    status: 'running',
  });
});

app.get('/api/health', async (_req, res) => {
  const ai = await checkAiHealth();
  res.json({
    success: true,
    service: 'gapfinder-backend',
    database: 'gapfinder_db',
    aiService: ai,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api', syllabusRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/revision', revisionRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;

if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[Backend] GapFinder AI API running on http://127.0.0.1:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Backend] Failed to connect to MongoDB Atlas:', err.message);
      process.exit(1);
    });
}

module.exports = app;
