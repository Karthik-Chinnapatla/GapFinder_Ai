const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subject = require('../models/Subject');
const EmailOtp = require('../models/EmailOtp');
const { requireAuth } = require('../middleware/auth');
const { issueCsrfToken, requireCsrf } = require('../middleware/csrf');
const { recalculateSubjectDiagnosis } = require('../services/diagnosisEngine');
const { syncRevisionPlanForSubject } = require('../services/revisionEngine');
const { ensureDemoAccountSeeded } = require('../seed/seedDemo');
const { sendOtpEmail, sendLoginSuccessEmail } = require('../services/emailService');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const OTP_MAX_ATTEMPTS = 5;

function signToken(user) {
  return jwt.sign({ userId: user._id.toString(), email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function generateSixDigitOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
}

router.get('/csrf-token', issueCsrfToken);

// Step 1 of creating a new account: validate inputs, verify CSRF token, and email a 6-digit OTP
router.post('/register', requireCsrf, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !name.trim() || !email || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateSixDigitOtp();
    const now = new Date();

    await EmailOtp.findOneAndUpdate(
      { email: normalizedEmail, purpose: 'register' },
      {
        email: normalizedEmail,
        purpose: 'register',
        otpHash: hashOtp(otp),
        userId: null,
        pendingName: name.trim(),
        pendingPasswordHash: passwordHash,
        attempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await sendOtpEmail({
        to: normalizedEmail,
        name: name.trim(),
        otp,
        purpose: 'register',
      });
    } catch (mailErr) {
      console.error('[Auth] Failed to send registration OTP email:', mailErr.message);
      return res.status(502).json({
        success: false,
        message: 'Could not send verification OTP email. Please verify your email address and try again.',
      });
    }

    return res.status(200).json({
      success: true,
      requiresOtp: true,
      email: normalizedEmail,
      message: `A 6-digit verification OTP has been sent to ${normalizedEmail}.`,
    });
  } catch (err) {
    next(err);
  }
});

// Step 2 of creating a new account: verify OTP, create user, log them in, and send thank-you login email
router.post('/verify-register-otp', requireCsrf, async (req, res, next) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and 6-digit OTP are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const record = await EmailOtp.findOne({ email: normalizedEmail, purpose: 'register' });

    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Verification OTP has expired or was not found. Please request a new OTP.',
      });
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect OTP attempts. Please create your account again to receive a fresh OTP.',
      });
    }

    if (record.otpHash !== hashOtp(otp)) {
      record.attempts += 1;
      await record.save();
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - record.attempts);
      return res.status(401).json({
        success: false,
        message: `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const loginTime = new Date();
    const user = await User.create({
      name: record.pendingName,
      email: normalizedEmail,
      passwordHash: record.pendingPasswordHash,
      role: 'student',
      isDemo: false,
      lastLoginAt: loginTime,
    });

    await EmailOtp.deleteOne({ _id: record._id });

    let loginMailSent = false;
    try {
      await sendLoginSuccessEmail({
        to: user.email,
        name: user.name,
        isNewUser: true,
        timestamp: loginTime,
      });
      loginMailSent = true;
    } catch (mailErr) {
      console.error('[Auth] Failed to send welcome/login-success email:', mailErr.message);
    }

    const token = signToken(user);
    return res.status(201).json({
      success: true,
      message: 'Thank you for logging into GapFinder AI. Successfully logged in!',
      loginMailSent,
      token,
      user: user.toSafeJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// Login: check DB for user -> if not found, signal redirect to Create Account;
// if found & password wrong -> "Username or password is wrong.";
// if found & password matches -> log in immediately & send confirmation email.
router.post('/login', requireCsrf, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        userNotFound: true,
        email: normalizedEmail,
        message: 'Account not found. Redirecting you to create an account.',
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Username or password is wrong.',
      });
    }

    const loginTime = new Date();
    user.lastLoginAt = loginTime;
    await user.save();

    let loginMailSent = false;
    try {
      await sendLoginSuccessEmail({
        to: user.email,
        name: user.name,
        isNewUser: false,
        timestamp: loginTime,
      });
      loginMailSent = true;
    } catch (mailErr) {
      console.error('[Auth] Failed to send login-success email:', mailErr.message);
    }

    const token = signToken(user);
    return res.json({
      success: true,
      message: 'Thank you for logging into GapFinder AI. Successfully logged in!',
      loginMailSent,
      token,
      user: user.toSafeJSON(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-otp', requireCsrf, async (req, res, next) => {
  try {
    const { email, purpose = 'register' } = req.body || {};
    if (!email || !['login', 'register'].includes(purpose)) {
      return res.status(400).json({ success: false, message: 'Valid email and purpose are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const record = await EmailOtp.findOne({ email: normalizedEmail, purpose });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'No active verification session found. Please submit the form again.',
      });
    }

    const elapsed = Date.now() - new Date(record.lastSentAt).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds}s before requesting another OTP.`,
      });
    }

    const otp = generateSixDigitOtp();
    const now = new Date();
    record.otpHash = hashOtp(otp);
    record.attempts = 0;
    record.lastSentAt = now;
    record.expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    await record.save();

    try {
      await sendOtpEmail({
        to: normalizedEmail,
        name: record.pendingName || 'Student',
        otp,
        purpose,
      });
    } catch (mailErr) {
      console.error('[Auth] Failed to resend OTP email:', mailErr.message);
      return res.status(502).json({
        success: false,
        message: 'Could not resend OTP email. Please try again in a moment.',
      });
    }

    return res.json({
      success: true,
      message: `A fresh 6-digit OTP has been sent to ${normalizedEmail}.`,
    });
  } catch (err) {
    next(err);
  }
});

// Dedicated server-side sample student login — never exposes password in frontend code
router.post('/demo-login', async (_req, res, next) => {
  try {
    const demoUser = await ensureDemoAccountSeeded();
    demoUser.lastLoginAt = new Date();
    await demoUser.save();

    const token = signToken(demoUser);
    return res.json({
      success: true,
      message: 'Signed in to the GapFinder AI Sample Student Account.',
      token,
      user: demoUser.toSafeJSON(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (_req, res) => {
  return res.json({ success: true, message: 'Logged out successfully.' });
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ success: true, user: req.user.toSafeJSON() });
});

router.patch('/preferences', requireAuth, async (req, res, next) => {
  try {
    const { currentSubjectId, thresholds } = req.body || {};
    if (currentSubjectId !== undefined) {
      if (currentSubjectId) {
        const owned = await Subject.findOne({ _id: currentSubjectId, userId: req.userId });
        if (!owned) {
          return res.status(404).json({ success: false, message: 'Subject not found.' });
        }
        req.user.currentSubjectId = owned._id;
      } else {
        req.user.currentSubjectId = null;
      }
    }

    let thresholdsUpdated = false;
    if (thresholds && typeof thresholds === 'object') {
      const nextT = {
        criticalMax: Number(thresholds.criticalMax ?? req.user.thresholds?.criticalMax ?? 39),
        needsImprovementMax: Number(thresholds.needsImprovementMax ?? req.user.thresholds?.needsImprovementMax ?? 59),
        developingMax: Number(thresholds.developingMax ?? req.user.thresholds?.developingMax ?? 79),
        minAttemptsForDiagnosis: Number(thresholds.minAttemptsForDiagnosis ?? req.user.thresholds?.minAttemptsForDiagnosis ?? 3),
      };
      if (!(nextT.criticalMax < nextT.needsImprovementMax && nextT.needsImprovementMax < nextT.developingMax)) {
        return res.status(400).json({
          success: false,
          message: 'Thresholds must strictly increase: Critical < Needs Improvement < Developing.',
        });
      }
      req.user.thresholds = nextT;
      thresholdsUpdated = true;
    }

    await req.user.save();

    if (thresholdsUpdated) {
      const subjects = await Subject.find({ userId: req.userId }).lean();
      for (const s of subjects) {
        await recalculateSubjectDiagnosis(req.userId, s._id, req.user.thresholds);
        await syncRevisionPlanForSubject(req.userId, s._id, req.user.isDemo);
      }
    }

    return res.json({ success: true, user: req.user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

// Prevent unmatched /api/auth/* routes from falling through to protected routers
router.use((_req, res) => {
  return res.status(404).json({ success: false, message: 'Auth endpoint not found.' });
});

module.exports = router;
