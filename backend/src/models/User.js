const mongoose = require('mongoose');

const thresholdSchema = new mongoose.Schema(
  {
    criticalMax: { type: Number, default: 39, min: 10, max: 50 },
    needsImprovementMax: { type: Number, default: 59, min: 30, max: 75 },
    developingMax: { type: Number, default: 79, min: 50, max: 95 },
    minAttemptsForDiagnosis: { type: Number, default: 3, min: 1, max: 10 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    isDemo: { type: Boolean, default: false },
    currentSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    thresholds: { type: thresholdSchema, default: () => ({}) },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'users', // Explicitly reuse existing gapfinder_db.users collection
  }
);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isDemo: this.isDemo,
    currentSubjectId: this.currentSubjectId,
    thresholds: this.thresholds,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
