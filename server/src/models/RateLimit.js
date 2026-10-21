import mongoose from 'mongoose';

// Fixed-window counters for rate limits (login, register, password checks). Stored in MongoDB so
// they hold across serverless instances; each document expires (TTL index) when its window ends.
const rateLimitSchema = new mongoose.Schema({
  _id: { type: String }, // e.g. "login-email:ana@example.com", "register-ip:203.0.113.4"
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true },
  expireAt: { type: Date, required: true },
}, { versionKey: false });
rateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RateLimit', rateLimitSchema);
