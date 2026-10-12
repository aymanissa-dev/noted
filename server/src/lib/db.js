import mongoose from 'mongoose';

// Fail fast instead of queueing queries while disconnected (serverless: no silent 10s hangs).
mongoose.set('bufferCommands', false);

// One cached connection per warm serverless instance, shared across invocations via globalThis.
let cached = globalThis.__notedMongoose;
if (!cached) cached = globalThis.__notedMongoose = { conn: null, promise: null };

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      maxPoolSize: 5,              // a serverless instance handles one request at a time
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 20000,
      maxIdleTimeMS: 60000,
    }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
