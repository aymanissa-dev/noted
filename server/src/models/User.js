import mongoose from 'mongoose';

export const RECENT_LIMIT = 10;
export const ACCENTS = ['amber', 'rose', 'emerald', 'sky', 'violet', 'stone'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    // Bumped to invalidate every issued token (sign out everywhere, password change).
    tokenVersion: { type: Number, default: 0 },
    // Optional PIN for locked notes (bcrypt hash). Version is bumped on change so unlock tokens expire.
    lockPinHash: { type: String, select: false, default: null },
    hasLockPin: { type: Boolean, default: false },
    lockPinVersion: { type: Number, default: 0 },
    lockPinFailures: { type: Number, default: 0, select: false },
    lockPinBlockedUntil: { type: Date, default: null, select: false },
    // Too many wrong PINs in total: PIN entry is off until the account password is entered.
    lockPinLockedOut: { type: Boolean, default: false, select: false },
    // The PIN in use is shorter than 6 digits (known after it's entered once); Settings suggests a new one.
    lockPinShort: { type: Boolean, default: false },
    // Recently opened notes, newest first (max RECENT_LIMIT).
    recent: { type: [{ _id: false, note: mongoose.Schema.Types.ObjectId, at: Date }], default: [], select: false },
    preferences: {
      accent: { type: String, enum: ACCENTS, default: 'amber' },
    },
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function () {
  return { id: this._id, name: this.name, email: this.email, hasLockPin: Boolean(this.hasLockPin), ...(this.hasLockPin && this.lockPinShort && { lockPinShort: true }), preferences: { accent: this.preferences?.accent || 'amber' }, createdAt: this.createdAt };
};

export default mongoose.model('User', userSchema);
