# Sunset Map — Plan

One claim to prove: **can you see the sun reach the horizon from here, on this date.**
Nothing else ships until that works.

---

## Phase 0 — The experiment (no app, no deploy)

Three scripts. Run locally. Output goes to your terminal.

```
/scripts
  pois.mjs        Overpass  -> data/pois.json
  horizons.mjs    GeoTIFF   -> data/horizons.json
  rank.mjs        suncalc   -> top 20 printed
/dem              12 .tif files, gitignored
```

Deps: `geotiff`, `suncalc`. That's it.

### pois.mjs

One Overpass call over East Java: `tourism=viewpoint`, `natural=peak`, `natural=beach`.
Expect a few hundred points. Save id / lat / lon / name / category.

### horizons.mjs

The GeoTIFF raycast from the earlier file, with two changes:

```js
for (let a = 240; a <= 300; a++) { ... }   // not 0..360
```

Sunset azimuth at 7°S runs 246°–294° across the year. 60 values covers it with margin.
Store plain numbers in JSON — ~120 KB for the whole province. No Int8, no binary format.

Keep the curvature term. At 30 km it's a 61 m drop, which is real terrain.

### rank.mjs

```js
import SunCalc from 'suncalc';
// walk the sun down, find the altitude where profile[azimuth] blocks it
// sort ascending, print top 20 with a Google Maps link
```

### Then go outside

Photograph five of the top-ranked and two of the bottom-ranked, at sunset.
Do the clean horizons match the high scores?

- **Yes** → the model works, continue.
- **No** → fix it here, before there is an app to rewrite.

This is the only phase that determines whether the product is real.

---

## Phase 1 — The map

Only after Phase 0 passes.

| | |
|---|---|
| Build | Vite + TypeScript |
| Map | MapLibre GL JS |
| Tiles | OpenFreeMap (free, no key) |
| Data | `horizons.json` + `pois.json` in `/public` |
| Weather | Open-Meteo, fetched from the browser |
| Sun | suncalc |

Features: markers colored by score, a date slider, tap for detail. That's the whole app.

Weather is one multiplier, nothing more:

```js
const conditions = Math.max(0, 1 - cloudCoverLow / 80);
```

No Gaussian, no upwind sampling, no invented constants. Until you have watched fifty
sunsets you have no basis for anything more elaborate. Refine it from your own notes.

---

## Deployment

Fully static. Both hosts work. Build once, upload a folder.

```bash
npm run build      # -> dist/
```

**GitHub Pages** — free, fine. Two gotchas: set Vite's `base: '/repo-name/'` unless
you're on a custom domain or a `user.github.io` repo, and the repo must be public
for free Pages. Limits: 1 GB site, ~100 GB/month bandwidth, 10 builds/hour. Your
data is ~150 KB, so none of that binds.

**Cloudflare Pages** — also free, and the better default here:

- No base-path friction
- Unlimited bandwidth
- Commercial use permitted (Vercel's Hobby tier is not)
- **Pages Functions as an escape hatch** — the reason that matters is below

### Why the escape hatch matters

Calling Open-Meteo directly from each browser means every visitor makes their own
requests. Fine for you and ten friends. At a few hundred users it stops being fine,
and the fix is a tiny proxy that caches one response per grid cell:

```js
// functions/api/weather.js — Cloudflare only
export async function onRequest({ request }) {
  const u = new URL(request.url);
  const lat = (+u.searchParams.get('lat')).toFixed(1);   // snap to model grid
  const lon = (+u.searchParams.get('lon')).toFixed(1);
  return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover_low`, {
    cf: { cacheTtl: 3600 },
  });
}
```

Same origin, same repo, no new service. On GitHub Pages there is nowhere to put this,
so you'd be migrating hosts at exactly the moment traffic arrives.

Reduce browser calls either way: snap coordinates to 0.1° before fetching and keep
results in `sessionStorage`. Nearby points then share one request.

---

## What is deliberately not here

Postgres, PostGIS, Redis, cron, Docker, Python, Next.js, PMTiles, Int8 packing,
tide models, waterfall flow curves, cloud-base derivation, candidate-cell generation,
and the six-category taxonomy.

Every one of those is a real idea. Every one is also unverifiable until sunset scoring
is proven against actual photographs. Add them when something you observed demands it,
not before.

---

## Later, in order

1. Sunrise — same code, azimuth window mirrored to 66°–114°
2. Waterfalls — POIs plus 7-day rainfall from Open-Meteo's archive.
   **Hard rule:** >80 mm in 24 h scores zero with a flood warning, never "great flow."
3. User photo submissions — the first thing that genuinely needs a database
4. Offline tile caching — these places have no signal
