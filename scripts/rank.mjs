#!/usr/bin/env node
// Print the best and worst sunset spots for a date, so you can go check them.
//
//   node scripts/rank.mjs                 today
//   node scripts/rank.mjs 2026-12-21      a specific date
//   node scripts/rank.mjs 2026-12-21 40   top 40

import { readFile } from 'node:fs/promises';
import {
  blockedAltitude, geometryScore, reachesHorizon, sunsetTime, sunsetAzimuth,
} from '../src/score.js';
import { TZ } from '../src/config.js';

const dateArg = process.argv[2];
const limit = parseInt(process.argv[3] ?? '20', 10);

const date = dateArg ? new Date(`${dateArg}T12:00:00+07:00`) : new Date();
if (isNaN(date.getTime())) {
  console.error('bad date, use YYYY-MM-DD');
  process.exit(1);
}

const pois = JSON.parse(await readFile('public/data/pois.json', 'utf8'));
const horizons = JSON.parse(await readFile('public/data/horizons.json', 'utf8'));

const scored = pois
  .filter((p) => horizons[p.id])
  .map((p) => {
    const blocked = blockedAltitude(horizons[p.id], p.lat, p.lon, date);
    return { ...p, blocked, score: geometryScore(blocked) };
  })
  .sort((a, b) => b.score - a.score || a.blocked - b.blocked);

const az = sunsetAzimuth(pois[0].lat, pois[0].lon, date);
console.log(`\n${date.toISOString().slice(0, 10)}  sunset azimuth ~${az}deg  (${scored.length} scored)\n`);

function show(list, heading) {
  console.log(heading);
  console.log('-'.repeat(heading.length));
  for (const p of list) {
    const set = sunsetTime(p.lat, p.lon, date);
    const hhmm = set && !isNaN(set)
      ? set.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
      : '--:--';
    const name = (p.name ?? '(unnamed)').slice(0, 34).padEnd(34);
    const blocked = reachesHorizon(p.blocked) ? 'clear ' : `+${p.blocked.toFixed(1)}deg`;
    console.log(
      `${String(p.score).padStart(3)}  ${name} ${p.cat.padEnd(9)} ${blocked}  ${hhmm}  ` +
      `https://maps.google.com/?q=${p.lat},${p.lon}`);
  }
  console.log();
}

show(scored.slice(0, limit), `TOP ${limit} -- expect a clean horizon`);
show(scored.slice(-5), 'BOTTOM 5 -- expect terrain in the way');

console.log('Go photograph a few from each list at sunset. If the top ones are');
console.log('blocked or the bottom ones are clear, fix the model before building.\n');
