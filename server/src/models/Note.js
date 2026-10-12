import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, default: '', maxlength: 200 },
    content: { type: String, default: '', maxlength: 100000 },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, deletedAt: 1, archived: 1, pinned: -1, updatedAt: -1 });

export default mongoose.model('Note', noteSchema);
