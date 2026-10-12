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
    color: { type: String, enum: NOTE_COLORS, default: '' },
    emoji: { type: String, default: '', maxlength: 16 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, deletedAt: 1, archived: 1, pinned: -1, updatedAt: -1 });

export default mongoose.model('Note', noteSchema);
