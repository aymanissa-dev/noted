import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, default: '', maxlength: 200 },
    content: { type: String, default: '', maxlength: 100000 },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, pinned: -1, updatedAt: -1 });

export default mongoose.model('Note', noteSchema);
