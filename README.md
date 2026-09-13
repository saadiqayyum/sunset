# senja: sunset spots in East Java

Which cafés, beaches, parks and viewpoints can actually see the sun reach the
horizon, on a given date. Places people go on an evening out — not summits.

Static site. No database, no server, no API keys. Two scripts generate ~900 KB
of data (~140 KB gzipped); everything else runs in the browser.

## Run it

```bash
npm install
npm run demo      # fake data, so you can see the UI immediately
npm run dev
```

The demo profiles are invented. For real output:

```bash
npm run dem       # ~210 MB of Copernicus GLO-30 tiles, once
npm run pois      # Overpass -> public/data/pois.json
npm run horizons  # the raycast -> public/data/horizons.json  (~40 s)
npm run rank      # print the best and worst spots for today
```

`npm run rank 2026-12-21 40` for a specific date and list length.

## Before building anything else

Take `npm run rank`, pick five from the top and two from the bottom, and go
photograph them at sunset. If the top ones are blocked or the bottom ones are
clear, the model is wrong and fixing it now is much cheaper than later.

That check is the point of this repo. The map is just a nicer way to read the
same numbers.

## How it works

`pois.mjs` pulls every named restaurant, café, bar, park, attraction, camp site,
beach, viewpoint and observation tower from OpenStreetMap (~3,000). OSM almost
never tags "has a view", so nothing is pre-filtered — the raycast decides.
Summits are deliberately excluded; hills people actually visit are tagged as
viewpoints or attractions.

`horizons.mjs` casts a ray every degree from 230° to 310° — the range the sun
sets across at this latitude — and records the highest terrain angle along each
one, with a correction for Earth curvature and refraction. That's 81 angles
(to a hundredth of a degree) per spot, computed once.

Two corrections against DEM artefacts, both in `src/config.js`:

- `DEM_ERR` (4 m): terrain must clear the observer by the DEM's vertical error
  to count. Without it, noise 40 m away reads as a 6° wall.
- `SNAP_RADIUS` (50 m): viewpoints stand on the highest cell nearby, because
  OSM nodes often sit beside the actual deck.

**Known limit:** a 30 m surface model sees hills and large buildings, not the
shophouse across the street. A street-level café marked clear has no terrain
in the way; whether its terrace does is for a photograph to settle.

In the browser, `score.js` walks the sun down through the hour before sunset in
30-second steps, interpolating between steps, and finds the altitude at which
terrain first hides it. Half a degree or less (one sun-width) counts as a clean
horizon. Profiles keep hundredths of a degree, so a café a few metres higher
than its neighbours ranks above them even when the difference is seconds.
Because the profile is precomputed, changing the
date is pure arithmetic — instant, and it works offline.

**Places nobody mapped.** Tap empty map (or use the locate button) and the
browser computes a profile for that exact point with the same raycast, reading
[Terrarium elevation tiles](https://registry.opendata.aws/terrain-tiles/) —
the Copernicus bucket sends no CORS headers, so the browser can't use it.
Inland the two agree to within a degree; on coastal cliffs they can differ by
a few. First tap in a new area downloads ~2 MB.

Cloud cover is fetched from Open-Meteo when you open a spot, and applied as
a single crude multiplier. That formula is a placeholder. Replace its constants
with what you learn from your own photographs.

### One thing that is easy to get backwards

In the southern hemisphere the sun sets **northwest in June** (~294°) and
**southwest in December** (~246°) — the opposite of the northern hemisphere.
A ridge that ruins your view in June may be irrelevant in December. This is the
main reason the date matters, and `npm test` has a case pinning it down.

## Tests

```bash
npm test
```

Checks the seasonal azimuth swing, that sea horizons never register as blocked,
that terrain below the horizon can't hide the sun, and that the score falls
monotonically as terrain rises.

## Deploy

```bash
npm run build     # -> dist/
```

`base: './'` in the Vite config means the same build works from a subdirectory,
so no host-specific configuration.

**Cloudflare Pages** — connect the repo, build command `npm run build`, output
directory `dist`. The function in `functions/api/` deploys automatically.

**GitHub Pages** — push `dist/` to the `gh-pages` branch, or use an Action. The
`.nojekyll` file is already in `public/` so the `assets` folder is served. Note
that free Pages requires a public repo, and there's nowhere to run the caching
function.

### Weather requests

By default every visitor calls Open-Meteo directly, deduplicated by a 0.1° grid
snap and cached in memory for the session. Fine for small traffic. When it isn't,
switch the fetch URL in `src/main.js` to `./api/weather?...` — the Cloudflare
function is already written and caches one upstream request per cell per hour.

## Layout

```
scripts/
  fetch-dem.mjs    download Copernicus GLO-30 tiles
  pois.mjs         Overpass query
  horizons.mjs     profiles for every spot -> horizons.json
  rank.mjs         printed leaderboard for ground-truthing
  demo-data.mjs    fake data for trying the UI
  selftest.mjs     scoring tests
src/
  config.js        constants shared by scripts and app
  horizon.js       the raycast, shared by horizons.mjs and the browser
  terrain.js       elevation tiles for dropped pins
  score.js         sun track vs horizon profile
  main.js          map, list, detail panel, weather
  style.css
functions/api/     optional Cloudflare weather proxy
```

## Attribution required

OpenStreetMap contributors (ODbL) · OpenMapTiles / OpenFreeMap ·
Copernicus DEM · Terrain Tiles on AWS (Mapzen, SRTM/NASA) ·
Open-Meteo (CC BY 4.0, free tier is non-commercial)
