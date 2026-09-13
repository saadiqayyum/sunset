// Horizon profiles for arbitrary points, computed in the browser.
//
// The offline data uses Copernicus GLO-30, but that bucket sends no CORS
// headers. Terrarium tiles (AWS Open Data, mostly SRTM here) do. Different
// source, so a dropped pin can differ from a nearby mapped spot by a degree
// or so; distant ridges, which decide most sunsets, agree closely.

import { horizonProfile, rayBounds } from './horizon.js';

// z12 cells are ~38 m here, close to the offline 40 m ray step.
// ponytail: ~28 tiles / ~2 MB per new area; drop to 11 if mobile data hurts.
const Z = 12;
const N = 2 ** Z;
const tiles = new Map(); // "x/y" -> Promise<Uint8ClampedArray>

const tileX = (lon) => ((lon + 180) / 360) * N;
const tileY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N;
};

function loadTile(x, y) {
  const key = `${x}/${y}`;
  if (!tiles.has(key)) {
    const p = fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
      .then((r) => {
        if (!r.ok) throw new Error(`terrain tile ${key}: ${r.status}`);
        return r.blob();
      })
      // Colour conversion would corrupt the encoded heights
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
      .then((bmp) => {
        const ctx = new OffscreenCanvas(256, 256).getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, 256, 256).data;
      });
    p.catch(() => tiles.delete(key)); // let a later tap retry
    tiles.set(key, p);
  }
  return tiles.get(key);
}

export async function profileAt(lat, lon) {
  const b = rayBounds(lat, lon);
  const loaded = new Map();
  const jobs = [];
  for (let x = Math.floor(tileX(b.west)); x <= Math.floor(tileX(b.east)); x++) {
    for (let y = Math.floor(tileY(b.north)); y <= Math.floor(tileY(b.south)); y++) {
      jobs.push(loadTile(x, y).then((px) => loaded.set(`${x}/${y}`, px)));
    }
  }
  await Promise.all(jobs);

  const elev = (la, lo) => {
    const fx = tileX(lo), fy = tileY(la);
    const px = loaded.get(`${Math.floor(fx)}/${Math.floor(fy)}`);
    const i = (Math.floor((fy % 1) * 256) * 256 + Math.floor((fx % 1) * 256)) * 4;
    // Terrarium encoding: (R * 256 + G + B / 256) - 32768
    const h = px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
    return h < 0 ? 0 : h; // sea surface
  };

  return horizonProfile(elev, lat, lon);
}
