import mongoose from 'mongoose';

let dbEnabled = false;

const songSchema = new mongoose.Schema({
  id: String, title: String, artist: String,
  votes: { type: Number, default: 0 },
  status: { type: String, default: 'active' }   // 'active' | 'done'
}, { _id: false });

const roundSchema = new mongoose.Schema({
  id: { type: String, index: true, unique: true },
  cycle: { type: Number, default: 0 },
  title: String,
  nextShow: String,
  open: Boolean,
  winnerId: String,
  songs: [songSchema],
  voters: [String],
  createdAt: Date
});

export const RoundModel = mongoose.model('Round', roundSchema);

export function isDbEnabled() {
  return dbEnabled;
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI no definido -> modo en memoria (los votos no persisten)');
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    dbEnabled = true;
    console.log('[db] MongoDB conectada');
  } catch (e) {
    console.error('[db] no se pudo conectar, modo en memoria:', e.message);
    dbEnabled = false;
  }
}
