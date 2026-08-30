import mongoose from 'mongoose';

let dbEnabled = false;

const itemSchema = new mongoose.Schema({
  id: String, title: String, artist: String, genre: String,
  votes: { type: Number, default: 0 }
}, { _id: false });

const roundSchema = new mongoose.Schema({
  id: { type: String, index: true, unique: true },
  cycle: { type: Number, default: 0 },
  title: String,
  open: Boolean,
  artistId: String,
  artistName: String,
  category: String,
  items: [itemSchema],
  createdAt: Date
});

const repertoireItemSchema = new mongoose.Schema({
  id: String, title: String, artist: String, genre: String
}, { _id: false });

const artistSchema = new mongoose.Schema({
  id: { type: String, index: true, unique: true },
  name: String,
  handle: String,
  category: String,
  code: { type: String, index: true, unique: true },
  repertoire: [repertoireItemSchema],
  createdAt: Date,
  updatedAt: Date
});

export const RoundModel = mongoose.model('Round', roundSchema);
export const ArtistModel = mongoose.model('Artist', artistSchema);

export function isDbEnabled() {
  return dbEnabled;
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI no definido -> modo en memoria (los datos no persisten)');
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
