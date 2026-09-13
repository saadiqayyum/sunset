// Cloudflare Pages Function. Optional — the app calls Open-Meteo directly by
// default. Switch to this once enough people use the site that you want one
// cached upstream request per grid cell instead of one per visitor.
//
// To use it, change the fetch URL in src/main.js to:
//   `./api/weather?lat=${p.lat}&lon=${p.lon}&date=${day}`

export async function onRequest({ request }) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get('lat'));
  const lon = Number(u.searchParams.get('lon'));
  const date = u.searchParams.get('date');

  if (!isFinite(lat) || !isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response('bad request', { status: 400 });
  }

  // Snap to the weather model grid so nearby viewpoints share a cache entry
  const la = (Math.round(lat * 10) / 10).toFixed(1);
  const lo = (Math.round(lon * 10) / 10).toFixed(1);

  const upstream = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
    `&hourly=cloud_cover_low&timezone=Asia%2FJakarta&start_date=${date}&end_date=${date}`;

  const res = await fetch(upstream, { cf: { cacheTtl: 3600, cacheEverything: true } });

  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=1800',
    },
  });
}
