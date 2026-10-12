import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './lib/db.js';

const { PORT = 5000, MONGODB_URI, JWT_SECRET } = process.env;
if (!MONGODB_URI || !JWT_SECRET) {
  console.error('MONGODB_URI and JWT_SECRET must be set (see .env.example)');
  process.exit(1);
}

connectDB(MONGODB_URI)
  .then(() => createApp().listen(PORT, () => console.log(`noted. API listening on :${PORT}`)))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
