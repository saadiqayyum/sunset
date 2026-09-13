import SunCalc from 'suncalc';
import { AZ_MIN, AZ_COUNT, HORIZON_ALT } from './config.js';

const DEG = 180 / Math.PI;

/**
 * Walk the sun down through the evening and find the altitude at which
 * terrain first hides it.
 *
 * @param {number[]} profile  AZ_COUNT terrain elevation angles, index 0 = AZ_MIN
 * @returns {number} altitude in degrees. <= HORIZON_ALT means a clean horizon.
 */
export function blockedAltitude(profile, lat, lon, date) {
  const set = SunCalc.getTimes(date, lat, lon).sunset;
  if (!set || isNaN(set.getTime())) return HORIZON_ALT;

  // Start an hour before sunset and step every 30 s (~0.12 deg of sun drop),
  // then interpolate between steps, so a few metres of height still count.
  const t = new Date(set.getTime() - 60 * 60_000);
  let prev = null; // [altitude, altitude above skyline] at the previous step

  for (let i = 0; i < 180; i++) {
    const pos = SunCalc.getPosition(t, lat, lon);
    const alt = pos.altitude * DEG;

    // suncalc measures azimuth from south, clockwise. Convert to from-north.
    const az = (pos.azimuth * DEG + 180 + 360) % 360;
    const f = az - AZ_MIN, j = Math.floor(f);
    const terrain = j >= 0 && j + 1 < AZ_COUNT
      ? profile[j] + (profile[j + 1] - profile[j]) * (f - j)
      : -90;

    // Terrain lying below the true horizon cannot hide anything.
    if (terrain > HORIZON_ALT && alt <= terrain) {
      if (!prev) return alt;
      const [pAlt, pGap] = prev;
      return Math.max(HORIZON_ALT, pAlt + (alt - pAlt) * (pGap / (pGap - (alt - terrain))));
    }
    if (alt <= HORIZON_ALT) return HORIZON_ALT; // sun made it all the way down

    prev = [alt, alt - terrain];
    t.setTime(t.getTime() + 30_000);
  }
  return HORIZON_ALT;
}

/**
 * A skyline within one sun-width (~0.5 deg) of the horizon still lets the sun
 * touch it, hidden under two minutes early. Scores 95+.
 */
export const reachesHorizon = (blocked) => blocked <= 0.5;

/** 0-100. 100 = sun reaches the true horizon. Each blocked degree costs 11. */
export function geometryScore(blocked) {
  return Math.max(0, Math.min(100, Math.round(100 - Math.max(0, blocked) * 11)));
}

/**
 * Conditions multiplier, 0-1.
 * Deliberately crude: low cloud is the only factor with an obvious sign.
 * Refine this from your own observations, not from theory.
 */
export function conditionsFactor(cloudCoverLow) {
  if (cloudCoverLow == null || isNaN(cloudCoverLow)) return null;
  return Math.max(0, 1 - cloudCoverLow / 80);
}

/** Local sunset time, for labelling and for picking the right weather hour. */
export function sunsetTime(lat, lon, date) {
  return SunCalc.getTimes(date, lat, lon).sunset;
}

/** Compass azimuth of sunset, degrees from north. */
export function sunsetAzimuth(lat, lon, date) {
  const set = SunCalc.getTimes(date, lat, lon).sunset;
  if (!set || isNaN(set.getTime())) return null;
  const pos = SunCalc.getPosition(set, lat, lon);
  return Math.round((pos.azimuth * DEG + 180 + 360) % 360);
}
