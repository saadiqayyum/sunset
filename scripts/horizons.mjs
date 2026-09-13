#!/usr/bin/env node
// For each POI, cast rays across the sunset azimuth window and record the
// maximum terrain elevation angle. Output: 81 angles per POI.
//
// Run once. Takes a while. Output is ~150 KB and never needs regenerating
// unless the POI list changes.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fromArrayBuffer } from 'geotiff';
import { MAX_DIST } from '../src/config.js';
import { horizonProfile } from '../src/horizon.js';

const DEM_DIR = 'dem';
const MAX_TILES_IN_MEMORY = 9; // a 3x3 neighbourhood; ~230 MB as Int16

// ---------------------------------------------------------------- DEM access

const cache = new Map(); // name -> { grid, ox, oy, rx, ry, w, h } | null

function tileName(lat, lon) {
  const la = Math.floor(lat), lo = Math.floor(lon);
  const ns = la < 0 ? `S${String(-la).padStart(2, '0')}` : `N${String(la).padStart(2, '0')}`;
  const ew = lo < 0 ? `W${String(-lo).padStart(3, '0')}` : `E${String(lo).padStart(3, '0')}`;
  return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
}

async function loadTile(name) {
  if (cache.has(name)) {
    const v = cache.get(name);      // refresh LRU position
    cache.delete(name);
    cache.set(name, v);
    return v;
  }

  let tile = null;
  try {
    const buf = await readFile(`${DEM_DIR}/${name}.tif`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const img = await (await fromArrayBuffer(ab)).getImage();

    let src = await img.readRasters({ interleave: true });
    if (Array.isArray(src)) src = src[0];

    // Float32 -> Int16 keeps nine tiles resident comfortably
    const grid = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      grid[i] = (!isFinite(v) || v < -500) ? 0 : Math.round(v);
    }

    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    tile = { grid, ox, oy, rx, ry, w: img.getWidth(), h: img.getHeight() };
  } catch {
    tile = null; // ocean, or outside coverage
  }

  cache.set(name, tile);
  while (cache.size > MAX_TILES_IN_MEMORY) {
    cache.delete(cache.keys().next().value);
  }
  return tile;
}

function elev(lat, lon) {
  const t = cache.get(tileName(lat, lon));
  if (!t) return 0; // sea level
  const c = Math.round((lon - t.ox) / t.rx);
  const r = Math.round((lat - t.oy) / t.ry);
  if (c < 0 || r < 0 || c >= t.w || r >= t.h) return 0;
  return t.grid[r * t.w + c];
}

// Preload every 1-degree tile the rays from this point can reach
async function warm(lat, lon) {
  const pad = MAX_DIST / 100_000; // ~0.3 degrees, generous
  for (let a = Math.floor(lat - pad); a <= Math.floor(lat + pad); a++) {
    for (let o = Math.floor(lon - pad); o <= Math.floor(lon + pad); o++) {
      await loadTile(tileName(a + 0.5, o + 0.5));
    }
  }
}

// ---------------------------------------------------------------- main

const pois = JSON.parse(await readFile('public/data/pois.json', 'utf8'));

// Process tile-by-tile so the LRU cache actually hits
pois.sort((a, b) =>
  Math.floor(a.lat) - Math.floor(b.lat) || Math.floor(a.lon) - Math.floor(b.lon));

const result = {};
const started = Date.now();

for (let i = 0; i < pois.length; i++) {
  const p = pois[i];
  await warm(p.lat, p.lon);
  result[p.id] = horizonProfile(elev, p.lat, p.lon, p.cat === 'viewpoint');

  if (i % 25 === 0 || i === pois.length - 1) {
    const done = i + 1;
    const rate = done / ((Date.now() - started) / 1000);
    const eta = Math.round((pois.length - done) / rate);
    process.stdout.write(
      `\r${done}/${pois.length}  ${rate.toFixed(1)}/s  eta ${eta}s   `);
  }
}

await mkdir('public/data', { recursive: true });
await writeFile('public/data/horizons.json', JSON.stringify(result));

const bytes = JSON.stringify(result).length;
console.log(`\n-> public/data/horizons.json (${(bytes / 1024).toFixed(0)} KB)`);
