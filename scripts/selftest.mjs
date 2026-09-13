#!/usr/bin/env node
// Sanity checks on the scoring maths, using synthetic horizon profiles.
// Run: npm run test

import { blockedAltitude, geometryScore, reachesHorizon, sunsetAzimuth } from '../src/score.js';
import { AZ_MIN, AZ_MAX, AZ_COUNT, HORIZON_ALT } from '../src/config.js';

const LAT = -7.25, LON = 112.75; // Surabaya
let fail = 0;

const ok = (cond, label, extra = '') => {
  console.log(`${cond ? ' ok ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
  if (!cond) fail++;
};

// --- 1. sunset azimuth should swing across the year -------------------------

const azJun = sunsetAzimuth(LAT, LON, new Date('2026-06-21T12:00:00+07:00'));
const azDec = sunsetAzimuth(LAT, LON, new Date('2026-12-21T12:00:00+07:00'));
const azMar = sunsetAzimuth(LAT, LON, new Date('2026-03-21T12:00:00+07:00'));

// Southern hemisphere: in June the sun is north of the equator, so it sets
// to the NORTHWEST. December is the southwest one. (Opposite of the north.)
ok(azJun >= 290 && azJun <= 298, 'June sunset azimuth ~294 (NW)', `got ${azJun}`);
ok(azDec >= 242 && azDec <= 250, 'December sunset azimuth ~246 (SW)', `got ${azDec}`);
ok(azMar >= 267 && azMar <= 273, 'March sunset azimuth ~270', `got ${azMar}`);
ok(azJun >= AZ_MIN && azDec <= AZ_MAX, 'both extremes inside the stored window');

// --- 2. flat sea horizon ----------------------------------------------------

const sea = new Array(AZ_COUNT).fill(-1);
const bSea = blockedAltitude(sea, LAT, LON, new Date('2026-09-13T12:00:00+07:00'));
ok(Math.abs(bSea - HORIZON_ALT) < 0.01, 'sea horizon is never blocked', `got ${bSea.toFixed(2)}`);
ok(geometryScore(bSea) === 100, 'sea horizon scores 100');

// --- 3. a 5-degree ridge all round -----------------------------------------

const ridge = new Array(AZ_COUNT).fill(5);
const bRidge = blockedAltitude(ridge, LAT, LON, new Date('2026-09-13T12:00:00+07:00'));
ok(bRidge > 4.5 && bRidge <= 5.3, 'uniform 5deg ridge blocks near 5deg', `got ${bRidge.toFixed(2)}`);
ok(geometryScore(bRidge) >= 40 && geometryScore(bRidge) <= 51,
   'and scores in the 40s', `got ${geometryScore(bRidge)}`);

// --- 4. a ridge only in the June direction ----------------------------------
// Blocks 285-310 (northwest) only. Should ruin June, leave December untouched.

const partial = new Array(AZ_COUNT).fill(-1);
for (let a = 285; a <= AZ_MAX; a++) partial[a - AZ_MIN] = 8;

const bJun = blockedAltitude(partial, LAT, LON, new Date('2026-06-21T12:00:00+07:00'));
const bDec = blockedAltitude(partial, LAT, LON, new Date('2026-12-21T12:00:00+07:00'));

ok(bJun > 6, 'June blocked by the northwest ridge', `got ${bJun.toFixed(2)}`);
ok(Math.abs(bDec - HORIZON_ALT) < 0.01, 'December unaffected by it',
   `got ${bDec.toFixed(2)}`);
ok(geometryScore(bDec) === 100 && geometryScore(bJun) < 30,
   'seasonal swing shows up in the score',
   `June ${geometryScore(bJun)} / Dec ${geometryScore(bDec)}`);

// --- 5. monotonic: a higher ridge is never a better score -------------------

let mono = true, prev = 101;
for (let h = 0; h <= 9; h++) {
  const s = geometryScore(blockedAltitude(
    new Array(AZ_COUNT).fill(h), LAT, LON, new Date('2026-09-13T12:00:00+07:00')));
  if (s > prev) mono = false;
  prev = s;
}
ok(mono, 'score decreases monotonically as the ridge rises');

// --- 6. small height differences survive ----------------------------------
// A rooftop 20 m up lowers a distant ridge by well under a degree. That has to
// show up, not be rounded away.

const d0913 = new Date('2026-09-13T12:00:00+07:00');
const b59 = blockedAltitude(new Array(AZ_COUNT).fill(5.9), LAT, LON, d0913);
const b58 = blockedAltitude(new Array(AZ_COUNT).fill(5.8), LAT, LON, d0913);
ok(b58 < b59 && Math.abs(b59 - b58 - 0.1) < 0.02,
   'a 0.1deg lower skyline hides the sun 0.1deg later', `${b59.toFixed(3)} vs ${b58.toFixed(3)}`);

// A ridge a fraction of a sun-width high still counts as reaching the horizon;
// a one-degree ridge does not.
ok(reachesHorizon(blockedAltitude(new Array(AZ_COUNT).fill(0.3), LAT, LON, d0913)) &&
   !reachesHorizon(blockedAltitude(new Array(AZ_COUNT).fill(1), LAT, LON, d0913)),
   '0.3deg skyline reaches the horizon, 1deg does not');

// --- 7. profile length matches what horizons.mjs writes ---------------------

ok(AZ_COUNT === AZ_MAX - AZ_MIN + 1 && AZ_COUNT === 81,
   'profile length is 81', `got ${AZ_COUNT}`);

console.log(fail ? `\n${fail} failing\n` : '\nall passing\n');
process.exit(fail ? 1 : 0);
