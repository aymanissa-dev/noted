import mongoose from 'mongoose';

export const MAX_FOLDERS = 200; // per user (also enforced by import)

const folderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { timestamps: true }
);
folderSchema.index({ user: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
folderSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

export default mongoose.model('Folder', folderSchema);
