import mongoose from 'mongoose';

export const NOTE_COLORS = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];

const noteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, default: '', maxlength: 200 },
    content: { type: String, default: '', maxlength: 100000 },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    color: { type: String, enum: NOTE_COLORS, default: '' },
    emoji: { type: String, default: '', maxlength: 16 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, deletedAt: 1, archived: 1, pinned: -1, updatedAt: -1 });

// Locked notes never serialize their title/content/tags unless the request unlocked them
// (routes set doc.$locals.unlocked = true after verifying an unlock token).
noteSchema.set('toJSON', {
  transform(doc, ret) {
    if (ret.locked && !doc.$locals?.unlocked) {
      ret.title = ''; ret.content = ''; ret.tags = []; ret.redacted = true;
    }
    return ret;
  },
});

export default mongoose.model('Note', noteSchema);
