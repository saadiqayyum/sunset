#!/usr/bin/env node
// Writes FAKE pois.json and horizons.json so you can run `npm run dev` and see
// the interface before downloading 45 MB of DEM. The horizon profiles are
// invented. Delete public/data and run the real pipeline before trusting
// anything you see here.

import { writeFile, mkdir } from 'node:fs/promises';
import { AZ_MIN, AZ_COUNT } from '../src/config.js';

const places = [
  ['Pantai Balekambang',   -8.4028, 112.5350, 'beach',     5],
  ['Pantai Papuma',        -8.4340, 113.5540, 'beach',    10],
  ['Pantai Klayar',        -8.2030, 111.1360, 'beach',     8],
  ['Gunung Bromo',         -7.9425, 112.9530, 'volcano', 2329],
  ['Gunung Penanggungan',  -7.6220, 112.6300, 'volcano', 1653],
  ['Gunung Arjuno',        -7.7620, 112.5890, 'volcano', 3339],
  ['Bukit Jaddih',         -7.0680, 112.7420, 'viewpoint', 60],
  ['Kawah Ijen',           -8.0583, 114.2420, 'volcano', 2769],
  ['Pantai Pasir Putih',   -7.7000, 113.7500, 'beach',     3],
  ['Bukit Teletubbies',    -7.9530, 112.9600, 'viewpoint',2200],
  ['Puncak B29',           -8.0330, 113.0170, 'viewpoint',2900],
  ['Pantai Sendang Biru',  -8.4340, 112.6910, 'beach',     6],
];

const pois = places.map(([name, lat, lon, cat, ele], i) => ({
  id: `demo${i}`, lat, lon, name, cat, ele,
}));

// Coast facing open water to the south or west gets a clear profile.
// Inland points get an invented ridge.
const horizons = {};
for (const p of pois) {
  const prof = new Array(AZ_COUNT);
  const coastal = p.cat === 'beach';
  for (let i = 0; i < AZ_COUNT; i++) {
    const az = AZ_MIN + i;
    if (coastal) {
      prof[i] = -1 - Math.round(Math.sqrt(Math.max(p.ele, 1)) / 4);
    } else {
      // a lumpy ridge, higher toward the northwest
      const lump = 3 + 4 * Math.sin((az - 230) / 14) + (az > 280 ? 3 : 0);
      prof[i] = Math.max(-1, Math.round(lump - (p.ele > 2000 ? 5 : 0)));
    }
  }
  horizons[p.id] = prof;
}

await mkdir('public/data', { recursive: true });
await writeFile('public/data/pois.json', JSON.stringify(pois));
await writeFile('public/data/horizons.json', JSON.stringify(horizons));

console.log(`wrote ${pois.length} DEMO points to public/data/`);
console.log('these horizon profiles are invented -- run the real pipeline before trusting them');
