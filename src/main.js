import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import SunCalc from 'suncalc';
import './style.css';

import { AZ_MIN, AZ_MAX, CENTER, TZ, HORIZON_ALT } from './config.js';
import { blockedAltitude, geometryScore, reachesHorizon, sunsetTime } from './score.js';
import { profileAt } from './terrain.js';

const DEG = 180 / Math.PI;
const $ = (id) => document.getElementById(id);

// Colours live in style.css; the map tint and markers read them from there.
const css = getComputedStyle(document.documentElement);
const C = Object.fromEntries(
  ['land', 'land-2', 'sea', 'plum', 'mist', 'sun', 'paper']
    .map((k) => [k, css.getPropertyValue(`--${k}`).trim()]));

const KINDS = {
  cafe: ['Café', 'Cafés'],
  restaurant: ['Restaurant', 'Restaurants'],
  beach: ['Beach', 'Beaches'],
  viewpoint: ['Viewpoint', 'Viewpoints'],
  park: ['Park', 'Parks'],
  camp: ['Campsite', 'Campsites'],
  attraction: ['Attraction', 'Attractions'],
  pin: ['Pin', 'Pins'],
};
const kindName = (c, plural) =>
  KINDS[c]?.[plural ? 1 : 0] ?? c[0].toUpperCase() + c.slice(1);

let pois = [];
let horizons = {};
let date = new Date();
let selected = null;
let cat = ''; // '' = every kind

// --------------------------------------------------------------- load data

async function loadData() {
  const [pRes, hRes] = await Promise.all([
    fetch('./data/pois.json'),
    fetch('./data/horizons.json'),
  ]);

  if (!pRes.ok || !hRes.ok) {
    $('status').textContent = 'No spot data found. Run npm run demo, or the pipeline in the README.';
    throw new Error('missing data files');
  }

  const raw = await pRes.json();
  horizons = await hRes.json();
  pois = raw.filter((p) => p.name && horizons[p.id]);

  if (!pois.length) {
    $('status').textContent = 'Spot data loaded, but no spot has a horizon profile.';
    throw new Error('no usable points');
  }
}

// --------------------------------------------------------------- scoring

function scoreAll() {
  return pois.map((p) => {
    const blocked = blockedAltitude(horizons[p.id], p.lat, p.lon, date);
    return { ...p, blocked, score: geometryScore(blocked) };
  });
}

let scored = [];

// How much of the sun you get to see: 4 = all the way down, 0 = hidden early.
const sunLevel = (score) =>
  score >= 95 ? 4 : score >= 70 ? 3 : score >= 40 ? 2 : score >= 15 ? 1 : 0;

const hhmm = (d) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

// Near the equator the sun drops about a degree every 4 minutes.
const hiddenAt = (p) =>
  new Date(sunsetTime(p.lat, p.lon, date).getTime() - (p.blocked - HORIZON_ALT) * 4.05 * 60_000);

function toGeoJSON(list) {
  return {
    type: 'FeatureCollection',
    features: list.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, score: p.score, level: sunLevel(p.score), cat: p.cat },
    })),
  };
}

// --------------------------------------------------------------- sun markers

// A sun with a hill across it. The more hill, the earlier it disappears.
function drawSun(level, px = 56) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const m = px / 2, r = px * 0.36;

  g.save();
  g.beginPath();
  g.arc(m, m, r, 0, 2 * Math.PI);
  g.fillStyle = C.sun;
  g.fill();
  g.clip();

  const cover = [0.9, 0.7, 0.5, 0.28, 0][level];
  if (cover) {
    const top = m + r - 2 * r * cover;
    g.beginPath();
    g.moveTo(0, top + r * 0.3);
    g.quadraticCurveTo(m * 0.7, top - r * 0.4, px, top + r * 0.2);
    g.lineTo(px, px);
    g.lineTo(0, px);
    g.fillStyle = C.plum;
    g.fill();
  }
  g.restore();

  g.beginPath();
  g.arc(m, m, r, 0, 2 * Math.PI);
  g.lineWidth = px * 0.07;
  g.strokeStyle = C.plum;
  g.stroke();
  return c;
}

const suns = [0, 1, 2, 3, 4].map((l) => drawSun(l));
const sunSrc = suns.map((c) => c.toDataURL());

// --------------------------------------------------------------- map

let map;

function tintMap() {
  const fills = {
    background: ['background-color', C.land],
    park: ['fill-color', C['land-2']],
    landcover_wood: ['fill-color', C['land-2']],
    landuse_residential: ['fill-color', C['land-2']],
    building: ['fill-color', C['land-2']],
    water: ['fill-color', C.sea],
    waterway: ['line-color', C.sea],
  };
  for (const l of map.getStyle().layers) {
    if (fills[l.id]) map.setPaintProperty(l.id, ...fills[l.id]);
    else if (l.id.startsWith('boundary')) map.setPaintProperty(l.id, 'line-color', C.mist);
    else if (l.type === 'symbol' && l.layout?.['text-field']) {
      const big = /^label_(city|town|state|country)/.test(l.id);
      map.setPaintProperty(l.id, 'text-color', big ? C.plum : C.mist);
      map.setPaintProperty(l.id, 'text-halo-color', C.land);
    }
  }
}

function buildMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: CENTER,
    zoom: 8,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  const geo = new maplibregl.GeolocateControl({ trackUserLocation: false });
  map.addControl(geo, 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
  geo.on('geolocate', (e) =>
    dropPin(e.coords.latitude, e.coords.longitude, 'you', 'Your location'));

  map.on('load', () => {
    tintMap();
    suns.forEach((c, i) =>
      map.addImage(`sun-${i}`, c.getContext('2d').getImageData(0, 0, c.width, c.height), { pixelRatio: 2 }));

    map.addSource('spots', { type: 'geojson', data: toGeoJSON(scored) });

    map.addLayer({
      id: 'focus',
      type: 'circle',
      source: 'spots',
      filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': 19,
        'circle-color': C.paper,
        'circle-stroke-color': C.plum,
        'circle-stroke-width': 2,
      },
    });

    map.addLayer({
      id: 'spots',
      type: 'symbol',
      source: 'spots',
      layout: {
        'icon-image': ['concat', 'sun-', ['to-string', ['get', 'level']]],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.45, 11, 0.8, 14, 1],
        'icon-allow-overlap': true,
        'symbol-sort-key': ['get', 'score'], // best suns drawn on top
      },
    });

    map.on('click', 'spots', (e) => select(e.features[0].properties.id));
    map.on('click', (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ['spots'] }).length) return;
      dropPin(e.lngLat.lat, e.lngLat.lng, 'pin', 'Pinned spot');
    });
    map.on('mouseenter', 'spots', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'spots', () => (map.getCanvas().style.cursor = ''));
    map.on('moveend', renderList);

    refresh();
  });
}

// Keep the spot clear of the card: beside it on desktop, above it on phones.
function cardPadding() {
  const r = $('card').getBoundingClientRect();
  return innerWidth > 640
    ? { left: r.right, top: 0, right: 0, bottom: 0 }
    : { left: 0, top: 0, right: 0, bottom: innerHeight - r.top };
}

const setFocus = (id) =>
  map?.getLayer('focus') && map.setFilter('focus', ['==', ['get', 'id'], id ?? '']);

// --------------------------------------------------------------- list

const shown = () => (cat ? scored.filter((p) => p.cat === cat || p.cat === 'pin') : scored);

function visible() {
  if (!map || !map.isStyleLoaded()) return shown();
  const b = map.getBounds();
  return shown().filter((p) =>
    p.lon >= b.getWest() && p.lon <= b.getEast() &&
    p.lat >= b.getSouth() && p.lat <= b.getNorth());
}

function renderList() {
  const all = shown();
  const clear = all.filter((p) => reachesHorizon(p.blocked)).length;
  $('status').textContent =
    `${clear.toLocaleString('en')} of ${all.length.toLocaleString('en')} ` +
    `${cat ? kindName(cat, true).toLowerCase() : 'spots'} see the sun go all the way down.`;

  const list = visible().sort((a, b) => a.blocked - b.blocked).slice(0, 40);
  const ol = $('list');
  ol.innerHTML = '';

  if (!list.length) {
    ol.innerHTML = '<li class="empty">No spots in this part of the map. Zoom out, or tap a place to check it.</li>';
    return;
  }

  for (const p of list) {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.innerHTML = `
      <img src="${sunSrc[sunLevel(p.score)]}" width="28" height="28" alt="" />
      <span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="when-hidden">${kindName(p.cat)}, ${reachesHorizon(p.blocked)
          ? 'sun goes all the way down'
          : `hidden by hills at ${hhmm(hiddenAt(p))}`}</span>
      </span>`;
    li.onclick = () => select(p.id);
    li.onkeydown = (e) => { if (e.key === 'Enter') select(p.id); };
    ol.appendChild(li);
  }
}

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// --------------------------------------------------------------- detail

function showDetail() {
  $('browse').hidden = true;
  $('detail').hidden = false;
}

function select(id) {
  const p = scored.find((x) => x.id === id);
  if (!p) return;
  selected = id;
  showDetail();

  const set = sunsetTime(p.lat, p.lon, date);
  $('d-name').textContent = p.name;
  $('d-meta').textContent = p.cat === 'pin'
    ? `Sunset at ${hhmm(set)}`
    : `${kindName(p.cat)}, sunset at ${hhmm(set)}`;

  if (reachesHorizon(p.blocked)) {
    $('d-verdict').textContent = 'The sun goes all the way down to the horizon here.';
  } else {
    const early = Math.round((set - hiddenAt(p)) / 60_000);
    $('d-verdict').textContent =
      `Hills to the west hide the sun at ${hhmm(hiddenAt(p))}, about ${early} minutes before sunset.`;
  }

  $('d-nearby').textContent = nearbyComparison(p);
  $('d-nav').href = `https://maps.google.com/?q=${p.lat},${p.lon}`;
  drawScene(p);
  loadWeather(p);
  setFocus(id);

  map.easeTo({
    center: [p.lon, p.lat],
    zoom: Math.max(map.getZoom(), 11),
    padding: cardPadding(),
  });
}

// Differences of a few metres move the sun by seconds, too small to show as a
// time, but they still decide which spot nearby is better.
function nearbyComparison(p) {
  const near = scored.filter((q) => q.id !== p.id &&
    Math.hypot((q.lat - p.lat) * 110.6, (q.lon - p.lon) * 109.7) < 5);
  const worse = near.filter((q) => q.blocked > p.blocked + 0.005).length;
  if (near.length < 5 || worse === 0) return '';
  return `Sun stays up longer here than at ${worse} of ${near.length} spots within 5 km.`;
}

// A place nobody mapped: fetch terrain for it and treat it like any other spot.
let pinSeq = 0;

async function dropPin(lat, lon, id, name) {
  const seq = ++pinSeq;
  selected = null;
  showDetail();
  $('d-name').textContent = name;
  $('d-meta').textContent = 'Reading the hills around this spot…';
  $('d-verdict').textContent = $('d-nearby').textContent = $('d-weather').textContent = '';
  $('d-scene').innerHTML = '';
  $('d-nav').href = `https://maps.google.com/?q=${lat},${lon}`;

  let profile;
  try {
    profile = await profileAt(lat, lon);
  } catch (err) {
    console.error(err);
    if (seq === pinSeq) {
      $('d-meta').textContent = "Couldn't load terrain for this spot. Check your connection and tap again.";
    }
    return;
  }
  if (seq !== pinSeq) return; // a newer tap won

  horizons[id] = profile;
  pois = pois.filter((p) => p.id !== id)
    .concat({ id, name, cat: 'pin', lat: +lat.toFixed(5), lon: +lon.toFixed(5) });
  scored = scoreAll();
  refresh();
  select(id);
}

$('back').onclick = () => {
  $('detail').hidden = true;
  $('browse').hidden = false;
  selected = null;
  pinSeq++;
  setFocus(null);
  renderList();
};

// The real skyline to the west, with the sun sliding down to where it vanishes.
function drawScene(p) {
  const profile = horizons[p.id];
  const W = 320, H = 150, ALT_MAX = 12, ALT_MIN = -3;
  const x = (az) => ((az - AZ_MIN) / (AZ_MAX - AZ_MIN)) * W;
  const y = (alt) => ((ALT_MAX - alt) / (ALT_MAX - ALT_MIN)) * H;
  const f = (n) => n.toFixed(1);

  // Skyline above the horizon only, smoothed through midpoints so it reads as
  // hills, not stairs. Below the horizon: a band of sea or haze, then ground.
  const y0 = y(0), ground = y(-1.5);
  // profiles are whole degrees; a 1-2-1 blur rounds the steps off for display
  const soft = profile.map((v, i) => (profile[i - 1] ?? v) / 4 + v / 2 + (profile[i + 1] ?? v) / 4);
  const pts = soft.map((v, i) => [x(AZ_MIN + i), y(Math.max(v, 0))]);
  let hills = `M 0 ${f(y0)} L ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    hills += ` Q ${f(px)} ${f(py)} ${f((px + cx) / 2)} ${f((py + cy) / 2)}`;
  }
  hills += ` L ${W} ${f(pts.at(-1)[1])} L ${W} ${f(y0)} Z`;

  // sun path from high in the sky down to where it disappears
  const hideAlt = Math.max(p.blocked, HORIZON_ALT);
  const track = [];
  const t = new Date(sunsetTime(p.lat, p.lon, date).getTime() - 70 * 60_000);
  for (let i = 0; i < 90; i++, t.setTime(t.getTime() + 60_000)) {
    const pos = SunCalc.getPosition(t, p.lat, p.lon);
    const alt = pos.altitude * DEG;
    if (alt > ALT_MAX + 2) continue;
    const az = (pos.azimuth * DEG + 180 + 360) % 360;
    track.push([f(x(az)), f(y(Math.max(alt, hideAlt)))]);
    if (alt <= hideAlt) break;
  }
  const path = `M ${track.map((q) => q.join(' ')).join(' L ')}`;
  const [ex, ey] = track.at(-1);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  $('d-scene').innerHTML = `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${C.sea}" stop-opacity="0.55" />
        <stop offset="1" stop-color="${C.sun}" stop-opacity="0.5" />
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${C.paper}" />
    <rect width="${W}" height="${H}" fill="url(#sky)" />
    <path d="${path}" fill="none" stroke="${C.plum}" stroke-opacity="0.35"
          stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round" />
    <g ${still ? `transform="translate(${ex} ${ey})"` : ''}>
      ${still ? '' : `<animateMotion dur="1.4s" begin="indefinite" fill="freeze"
          calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.3 0 0.2 1" path="${path}" />`}
      <circle r="20" fill="${C.sun}" fill-opacity="0.3" />
      <circle r="12" fill="${C.sun}" />
    </g>
    <rect y="${f(y0)}" width="${W}" height="${f(ground - y0)}" fill="${C.sea}" />
    <rect y="${f(ground)}" width="${W}" height="${f(H - ground)}" fill="${C.plum}" />
    <path d="${hills}" fill="${C.plum}" />
    <text x="${f(x(270))}" y="${H - 8}" fill="${C.paper}" font-size="11"
          text-anchor="middle" font-family="inherit">west</text>`;

  if (!still) $('d-scene').querySelector('animateMotion').beginElement();
}

// --------------------------------------------------------------- weather

const wxCache = new Map();

async function loadWeather(p) {
  const el = $('d-weather');
  const day = localDateKey(date);
  const lat = (Math.round(p.lat * 10) / 10).toFixed(1);
  const lon = (Math.round(p.lon * 10) / 10).toFixed(1);
  const key = `${lat},${lon},${day}`;

  el.textContent = 'Checking the clouds…';

  try {
    if (!wxCache.has(key)) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=cloud_cover_low&timezone=${encodeURIComponent(TZ)}` +
        `&start_date=${day}&end_date=${day}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      wxCache.set(key, await r.json());
    }

    const wx = wxCache.get(key);
    const set = sunsetTime(p.lat, p.lon, date);
    // Nearest hour to sunset, in Open-Meteo's "YYYY-MM-DDTHH:00" local format
    const hour = new Date(set.getTime() + 30 * 60_000)
      .toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 13).replace(' ', 'T');
    const idx = (wx.hourly?.time ?? []).findIndex((t) => t.slice(0, 13) === hour);

    if (idx < 0) { el.textContent = 'The cloud forecast only covers the next 16 days.'; return; }

    const low = wx.hourly.cloud_cover_low[idx];
    el.textContent = `${low}% low cloud around sunset. ` +
      (low > 70 ? 'Probably grey.' : low > 35 ? 'Might be patchy.' : 'Should be a clear view.');
  } catch {
    el.textContent = "The cloud forecast didn't load. Open the spot again to retry.";
  }
}

const localDateKey = (d) => d.toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 10);

// --------------------------------------------------------------- date & kinds

$('date').onchange = (e) => {
  if (!e.target.value) return;
  date = new Date(`${e.target.value}T12:00:00+07:00`);
  scored = scoreAll();
  refresh();
  if (selected) select(selected);
};

function refresh() {
  if (map.getSource('spots')) map.getSource('spots').setData(toGeoJSON(scored));
  // Layer exists only after map load, which calls refresh() itself
  if (map.getLayer('spots')) {
    map.setFilter('spots', cat ? ['in', ['get', 'cat'], ['literal', [cat, 'pin']]] : null);
  }
  renderList();
}

function fillKinds() {
  const counts = {};
  for (const p of pois) counts[p.cat] = (counts[p.cat] ?? 0) + 1;
  const kinds = ['', ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])];

  for (const k of kinds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = k ? kindName(k, true) : 'Everything';
    b.setAttribute('aria-pressed', String(k === cat));
    b.onclick = () => {
      cat = k;
      for (const other of $('kinds').children) other.setAttribute('aria-pressed', String(other === b));
      refresh();
    };
    $('kinds').appendChild(b);
  }
}

// --------------------------------------------------------------- startup

loadData()
  .then(() => {
    $('date').value = localDateKey(date);
    fillKinds();
    scored = scoreAll();
    buildMap();
    renderList(); // don't wait for map tiles to show the list
  })
  .catch((err) => console.error(err));
