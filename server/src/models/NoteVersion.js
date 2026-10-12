import mongoose from 'mongoose';

// A snapshot of a note's editable fields at a point in time.
const noteVersionSchema = new mongoose.Schema(
  {
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    tags: { type: [String], default: [] },
    color: { type: String, default: '' },
    emoji: { type: String, default: '' },
    reason: { type: String, enum: ['edit', 'restore'], default: 'edit' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

noteVersionSchema.index({ note: 1, user: 1, createdAt: -1 });

export default mongoose.model('NoteVersion', noteVersionSchema);
