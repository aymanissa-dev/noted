import mongoose from 'mongoose';

export const DEFAULT_TIME_ZONE = 'Africa/Nairobi';
export const isTimeZone = (tz) => { if (typeof tz !== 'string' || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

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
    // Folders this account has, kept atomically by lib/folderQuota.js (cap: MAX_FOLDERS). No default on
    // purpose: missing means "not counted yet" and is filled in from the folders on first use.
    folderCount: { type: Number, select: false },
    // Images (count and total bytes), kept atomically by lib/images.js. Same "missing = not counted yet" rule.
    imageCount: { type: Number, select: false },
    imageBytes: { type: Number, select: false },
    // Recently opened notes, newest first (max RECENT_LIMIT).
    recent: { type: [{ _id: false, note: mongoose.Schema.Types.ObjectId, at: Date }], default: [], select: false },
    preferences: {
      accent: { type: String, enum: ACCENTS, default: 'amber' },
      // IANA zone that reminders are shown and entered in (times are stored in UTC).
      timeZone: { type: String, default: DEFAULT_TIME_ZONE, maxlength: 64 },
    },
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function () {
  return { id: this._id, name: this.name, email: this.email, hasLockPin: Boolean(this.hasLockPin), ...(this.hasLockPin && this.lockPinShort && { lockPinShort: true }), preferences: { accent: this.preferences?.accent || 'amber', timeZone: this.preferences?.timeZone || DEFAULT_TIME_ZONE }, createdAt: this.createdAt };
};

export default mongoose.model('User', userSchema);
