import mongoose from 'mongoose';

export const ACTIVITY_LIMIT = 20;
// One sign-in (login or registration). Only the masked IP and parsed user agent are stored.
const loginEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  at: { type: Date, default: Date.now },
  kind: { type: String, enum: ['login', 'register'], default: 'login' },
  browser: String, os: String, device: String,
  ip: String,        // masked
  location: String,  // approximate (city/country from the edge network), if available
  tv: Number,        // token version at sign-in: the session is revoked once it no longer matches
  endedAt: Date,     // set when this session logged out
});
loginEventSchema.index({ user: 1, at: -1 });

export default mongoose.model('LoginEvent', loginEventSchema);
