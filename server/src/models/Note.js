import mongoose from 'mongoose';
import { plainText } from '../lib/plain.js';

export const NOTE_COLORS = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];

const noteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, select: false }, // see the clientId index below
    title: { type: String, trim: true, default: '', maxlength: 200 },
    content: { type: String, default: '', maxlength: 100000 },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    color: { type: String, enum: NOTE_COLORS, default: '' },
    emoji: { type: String, default: '', maxlength: 16 },
    deletedAt: { type: Date, default: null },
    // Markdown stripped to plain text, so search matches what you see (never sent to clients).
    plain: { type: String, default: '', select: false },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    // Version-history bookkeeping (never sent to clients).
    editSession: { type: String, default: '', select: false, maxlength: 64 },
    changeSinceVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

// Main list query (view filter + pinned/updatedAt sort), trash view, tag filter, and import/export scans.
noteSchema.index({ user: 1, deletedAt: 1, archived: 1, pinned: -1, updatedAt: -1 });
noteSchema.index({ user: 1, deletedAt: -1 });
noteSchema.index({ user: 1, updatedAt: -1 });
noteSchema.index({ user: 1, tags: 1 });
noteSchema.index({ user: 1, folderId: 1 });
// Idempotent creates: the client's local id for a new note. A create that is re-sent (the page was
// reloaded mid-request, or the offline queue retries) returns the note it already made.
noteSchema.index({ user: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

noteSchema.pre('validate', function (next) {
  if (this.isNew || this.isModified('content')) this.plain = plainText(this.content);
  next();
});

// Locked notes never serialize their title/content/tags unless the request unlocked them
// (routes set doc.$locals.unlocked = true after verifying an unlock token).
noteSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.plain; delete ret.editSession; delete ret.changeSinceVersion;
    if (ret.locked && !doc.$locals?.unlocked) {
      ret.title = ''; ret.content = ''; ret.tags = []; ret.redacted = true;
    }
    return ret;
  },
});

export default mongoose.model('Note', noteSchema);
