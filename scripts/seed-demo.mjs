// =============================================================================
//  Seed de DEMO — Tierra Canela en vivo con votos ficticios
//  Deja la ronda de Tierra Canela abierta y con un ranking escalonado para
//  probar en vivo cómo una canción supera a otra:
//    #1 = #2 + 1   |   #2 = #3 + 2   |   resto en la base (10)
//  Uso:  node scripts/seed-demo.mjs
//  Requiere MONGODB_URI en el entorno (.env).
// =============================================================================
import 'dotenv/config';
import mongoose from 'mongoose';
import { ArtistModel, RoundModel } from '../db.js';

// Votos por título (la mejor arriba). Cambia estos números si quieres otro ranking.
const VOTOS = {
  'El Taxista': 13,             // #1
  'Ya No Vuelvo Contigo': 12,   // #2  (#1 - 1)
  'Amor de los Dos': 10,        // #3  (#2 - 2)
  'La Pollera Colorá': 10,      // base
  'Quiero un Amor Así': 10      // base
};
const VOTOS_BASE = 10; // para cualquier canción no listada arriba

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('Falta MONGODB_URI'); process.exit(1); }
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

const artist = await ArtistModel.findOne({ name: /tierra canela/i });
if (!artist) { console.error('No existe el artista Tierra Canela'); process.exit(1); }
if (!artist.repertoire.length) { console.error('Tierra Canela no tiene repertorio'); process.exit(1); }

// Toma la ronda más reciente de este artista, o crea una nueva si no hay.
let round = await RoundModel.findOne({ artistId: artist.id }).sort({ createdAt: -1 });
if (!round) {
  round = new RoundModel({
    id: Math.random().toString(36).slice(2, 12),
    cycle: 0, title: 'Elige la siguiente canción',
    artistId: artist.id, artistName: artist.name, category: artist.category
  });
}

// Reconstruye los items desde el repertorio actual, aplicando los votos.
round.items = artist.repertoire.map(it => ({
  id: it.id, title: it.title, artist: it.artist || '', genre: it.genre || '',
  votes: VOTOS[it.title] ?? VOTOS_BASE
}));
round.open = true;                 // disponible para votar
round.cycle = 0;
round.createdAt = new Date();      // la más reciente -> el server la carga al bootear
await round.save();

const ranked = [...round.items].sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id));
console.log(`Ronda demo lista: ${round.id} (${artist.name}) abierta=${round.open}`);
ranked.forEach((it, i) => console.log(`  #${i + 1}  ${it.votes} votos  —  ${it.title}`));
await mongoose.disconnect();
