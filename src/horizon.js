// The raycast, shared by scripts/horizons.mjs (Copernicus tiles on disk) and the
// browser (Terrarium tiles, for points dropped on the map).

import {
  AZ_MIN, AZ_MAX, MAX_DIST, STEP, EYE, R_EFF, DEM_ERR, SNAP_RADIUS,
} from './config.js';

/**
 * For each azimuth AZ_MIN..AZ_MAX, the highest terrain elevation angle.
 *
 * @param {(lat: number, lon: number) => number} elev  metres; every point the
 *   rays reach must already be loaded (see rayBounds)
 * @param {boolean} snap  stand on the highest cell within SNAP_RADIUS
 * @returns {number[]} AZ_COUNT angles in degrees, to 0.01
 */
export function horizonProfile(elev, lat, lon, snap = false) {
  const mLat = 110_574;
  const mLon = 111_320 * Math.cos((lat * Math.PI) / 180);

  let ground = elev(lat, lon);
  if (snap) {
    for (let dy = -SNAP_RADIUS; dy <= SNAP_RADIUS; dy += STEP / 2) {
      for (let dx = -SNAP_RADIUS; dx <= SNAP_RADIUS; dx += STEP / 2) {
        if (dx * dx + dy * dy > SNAP_RADIUS ** 2) continue;
        ground = Math.max(ground, elev(lat + dy / mLat, lon + dx / mLon));
      }
    }
  }
  const h0 = ground + EYE + DEM_ERR;
  const out = [];

  for (let a = AZ_MIN; a <= AZ_MAX; a++) {
    const rad = (a * Math.PI) / 180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    let best = -90;

    for (let d = STEP; d <= MAX_DIST; d += STEP) {
      const h = elev(lat + (d * cos) / mLat, lon + (d * sin) / mLon);
      const drop = (d * d) / (2 * R_EFF);
      const ang = (Math.atan2(h - drop - h0, d) * 180) / Math.PI;
      if (ang > best) best = ang;
    }
    // hundredths: whole degrees erased tens of metres of height
    out.push(Math.max(-90, Math.min(90, Math.round(best * 100) / 100)));
  }
  return out;
}

/** Lat/lon box every ray (and the snap search) can touch. Rays only point west. */
export function rayBounds(lat, lon) {
  const dLat = (MAX_DIST + SNAP_RADIUS) / 110_574;
  const dLon = (MAX_DIST + SNAP_RADIUS) / (111_320 * Math.cos((lat * Math.PI) / 180));
  const east = SNAP_RADIUS / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + east };
}
