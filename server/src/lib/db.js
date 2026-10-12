import mongoose from 'mongoose';

// Cached connection so serverless invocations reuse one connection per warm instance.
let cached = globalThis.__notedMongoose;
if (!cached) cached = globalThis.__notedMongoose = { conn: null, promise: null };

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (cached.conn) return cached.conn;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
