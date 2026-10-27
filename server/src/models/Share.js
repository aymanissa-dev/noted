import mongoose from 'mongoose';

// A public, read-only link to one note: /s/<token>. Anyone with the link can read the note's
// current title and text (and the images in it) without signing in; nothing else of the owner's.
// One link per note. Revoking deletes the document (the old link is a 404 at once); regenerating
// replaces the token. The token is 32 random bytes (base64url): unguessable, and stored as is so
// the owner can copy the link again later (it grants read access to that one note only).
const shareSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, unique: true },
    token: { type: String, required: true, unique: true },
    // Read-only for now. Kept explicit so a later "allow edits" option has a place to live.
    allowEdits: { type: Boolean, default: false },
    // Off by default: the page and its API answers carry noindex unless the owner opts in (later).
    allowIndexing: { type: Boolean, default: false },
  },
  { timestamps: true }
);

shareSchema.set('toJSON', {
  transform(doc, ret) {
    return { _id: ret._id, note: ret.note, token: ret.token, allowEdits: ret.allowEdits, allowIndexing: ret.allowIndexing, createdAt: ret.createdAt, updatedAt: ret.updatedAt };
  },
});

export default mongoose.model('Share', shareSchema);
