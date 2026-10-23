import mongoose from 'mongoose';

// Sessions ended by "Log out" on one device. The key is the token's session id (sid), or a hash of
// the token itself for tokens issued without one. Each row only needs to live as long as the token
// could still be valid, so it expires (TTL index) at the token's own expiry.
const revokedSessionSchema = new mongoose.Schema({
  _id: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expireAt: { type: Date, required: true },
}, { versionKey: false });
revokedSessionSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RevokedSession', revokedSessionSchema);
