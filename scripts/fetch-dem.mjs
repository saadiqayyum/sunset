#!/usr/bin/env node
// Download Copernicus GLO-30 DEM tiles covering the bounding box.
// Public AWS Open Data bucket, no credentials. Ocean tiles do not exist -> 404 is normal.

import { writeFile, mkdir, stat } from 'node:fs/promises';
import { BBOX } from '../src/config.js';

const BUCKET = 'https://copernicus-dem-30m.s3.amazonaws.com';
const DIR = 'dem';

// Tiles are named by their south-west corner.
function tileName(lat, lon) {
  const ns = lat < 0 ? `S${String(-lat).padStart(2, '0')}` : `N${String(lat).padStart(2, '0')}`;
  const ew = lon < 0 ? `W${String(-lon).padStart(3, '0')}` : `E${String(lon).padStart(3, '0')}`;
  return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
}

await mkdir(DIR, { recursive: true });

let got = 0, skipped = 0, missing = 0;

for (let lat = Math.floor(BBOX.south); lat < Math.ceil(BBOX.north); lat++) {
  for (let lon = Math.floor(BBOX.west); lon < Math.ceil(BBOX.east); lon++) {
    const name = tileName(lat, lon);
    const path = `${DIR}/${name}.tif`;

    try {
      const s = await stat(path);
      if (s.size > 0) { skipped++; continue; }
    } catch { /* not downloaded yet */ }

    const url = `${BUCKET}/${name}/${name}.tif`;
    process.stdout.write(`${name} ... `);

    const res = await fetch(url);
    if (!res.ok) {
      console.log(res.status === 403 || res.status === 404 ? 'no tile (ocean)' : `HTTP ${res.status}`);
      missing++;
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(path, buf);
    console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
    got++;
  }
}

console.log(`\ndownloaded ${got}, already had ${skipped}, no tile ${missing}`);
