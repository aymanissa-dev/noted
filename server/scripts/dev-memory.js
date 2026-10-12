// Local dev/QA: runs the API against an in-memory MongoDB (no setup needed).
// Usage: node scripts/dev-memory.js  (PORT defaults to 5055)
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';

process.env.JWT_SECRET ||= 'dev-memory-secret';
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
const port = Number(process.env.PORT) || 5055;
createApp().listen(port, () => console.log(`noted. API (in-memory DB) on http://localhost:${port}/api`));
