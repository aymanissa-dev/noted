import mongoose from 'mongoose';

// Images are compressed in the browser first (long side ≤ 2000px, WebP/JPEG ~0.82, EXIF stripped).
// The cap keeps every upload well under Vercel's 4.5 MB request body limit.
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const IMAGE_MAX_PER_USER = 200;
export const IMAGE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 8000; // sanity bound on the decoded header, not a resize target
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

// An image in a note: binary data stored privately in MongoDB (like voice notes), owned by one user
// and one note. Notes reference it in Markdown as ![alt](noted-image:<id>).
//
// orphanedAt: when the image stopped being referenced by its note's text (set at upload, cleared on
// the first save that references it). lib/images.js deletes images that have been orphaned longer
// than a grace period AND aren't referenced by any of the user's notes or note history.
const imageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    mime: { type: String, required: true, enum: IMAGE_TYPES },
    size: { type: Number, required: true, min: 1, max: IMAGE_MAX_BYTES },
    width: { type: Number, required: true, min: 1, max: IMAGE_MAX_DIMENSION },
    height: { type: Number, required: true, min: 1, max: IMAGE_MAX_DIMENSION },
    orphanedAt: { type: Date, default: () => new Date() },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true }
);
imageSchema.index({ user: 1, orphanedAt: 1 });

imageSchema.set('toJSON', { transform: (doc, ret) => { delete ret.data; delete ret.__v; delete ret.user; delete ret.orphanedAt; return ret; } });

export default mongoose.model('Image', imageSchema);
