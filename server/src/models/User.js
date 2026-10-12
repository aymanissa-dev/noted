import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function () {
  return { id: this._id, name: this.name, email: this.email, createdAt: this.createdAt };
};

export default mongoose.model('User', userSchema);
