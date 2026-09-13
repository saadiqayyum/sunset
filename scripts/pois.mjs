#!/usr/bin/env node
// Fetch candidate sunset spots from OpenStreetMap. Run occasionally, by hand.
// Overpass is a shared volunteer service -- never loop this, never run it in CI.
//
// Places people actually go on an evening out, not summits. OSM rarely tags
// "has a view", so every reachable venue goes in and the raycast decides.

import { writeFile, mkdir } from 'node:fs/promises';

// Main instance often 504s on a province-wide area query; the mirror copes.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const QUERY = `
[out:json][timeout:300];
area["ISO3166-2"="ID-JI"]->.ea;
(
  nwr["tourism"~"^(viewpoint|attraction|picnic_site|camp_site|theme_park)$"](area.ea);
  nwr["amenity"~"^(restaurant|cafe|bar|pub)$"](area.ea);
  nwr["leisure"="park"]["name"](area.ea);
  nwr["natural"="beach"](area.ea);
  nwr["man_made"="tower"]["tower:type"="observation"](area.ea);
);
out center tags qt;
`;

function category(t = {}) {
  if (t.natural === 'beach') return 'beach';
  if (t.man_made === 'tower' || t.tourism === 'viewpoint') return 'viewpoint';
  if (t.amenity === 'restaurant') return 'restaurant';
  if (t.amenity) return 'cafe'; // cafe, bar, pub
  if (t.tourism === 'camp_site') return 'camp';
  if (t.tourism === 'picnic_site' || t.leisure === 'park') return 'park';
  return 'attraction';
}

console.log('querying overpass...');

let res;
for (const url of ENDPOINTS) {
  res = await fetch(url, {
    method: 'POST',
    // Overpass returns 406 for Node's default User-Agent
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'sunset-map/0.1 (personal research script)',
    },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (res.ok) break;
  console.error(`${url} returned ${res.status} ${res.statusText}`);
}

if (!res.ok) {
  console.error('all endpoints failed; if 429 or 504, wait a few minutes and retry');
  process.exit(1);
}

const { elements = [] } = await res.json();

const pois = elements
  .map((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return null;

    const t = el.tags ?? {};
    if (!t.name) return null; // can't be found or visited without a name
    return {
      id: `${el.type[0]}${el.id}`,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      name: t.name,
      cat: category(t),
      ele: t.ele ? Math.round(parseFloat(t.ele)) || null : null,
    };
  })
  .filter(Boolean);

// Drop near-duplicates within ~50 m (beaches especially get mapped many times)
const seen = new Set();
const deduped = pois.filter((p) => {
  const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

await mkdir('public/data', { recursive: true });
await writeFile('public/data/pois.json', JSON.stringify(deduped));

const byCat = deduped.reduce((a, p) => ({ ...a, [p.cat]: (a[p.cat] ?? 0) + 1 }), {});
console.log(`${deduped.length} POIs (${pois.length - deduped.length} dupes dropped)`);
console.log(byCat);
console.log('-> public/data/pois.json');
