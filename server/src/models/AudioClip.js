import mongoose from 'mongoose';

export const AUDIO_MAX_BYTES = 4 * 1024 * 1024;   // Vercel functions accept ~4.5 MB request bodies
export const AUDIO_MAX_SECONDS = 5 * 60;
export const AUDIO_MAX_PER_USER = 200;
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];

// A voice note: binary audio stored privately in MongoDB (size-capped), owned by one user and note.
const audioClipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true, max: AUDIO_MAX_BYTES },
    duration: { type: Number, default: 0, max: AUDIO_MAX_SECONDS + 5 },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true }
);

audioClipSchema.set('toJSON', { transform: (doc, ret) => { delete ret.data; delete ret.__v; delete ret.user; return ret; } });

export default mongoose.model('AudioClip', audioClipSchema);
