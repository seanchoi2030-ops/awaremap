/**
 * Cloudflare Pages Function — the hosted twin of serve.py's /api/proxy.
 *
 * A handful of the data sources Awaremap uses do not send CORS headers, so a browser
 * refuses to read them. This forwards those requests from the edge instead. It is
 * deliberately narrow: GET only, https only, and only the five hosts below. Without the
 * allowlist this would be an open relay that anyone on the internet could point at any
 * server, which is exactly the mistake the local version made first.
 *
 * Routed automatically at /api/proxy — same path the Python dev server uses, so the
 * front-end code is identical whether it runs locally or on Pages.
 */

const ALLOWED = new Set([
  'api.adsb.lol',            // live aircraft positions
  'opendata.adsb.fi',        // aircraft fallback mirror
  'opensky-network.org',     // aircraft fallback mirror
  'api.gdeltproject.org',    // local news coverage
  'aviationweather.gov',     // NOAA METARs + pilot reports
]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;

  if (params.has('ping')) {
    return json({ ok: true, hosts: [...ALLOWED].sort(), runtime: 'cloudflare-pages' });
  }

  let target;
  try {
    target = new URL(params.get('url') || '');
  } catch {
    return json({ error: 'missing or malformed url parameter' }, 400);
  }

  if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname)) {
    return json({ error: 'host not allowed', host: target.hostname }, 403);
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'awaremap/1.0', Accept: 'application/json' },
      cf: { cacheTtl: 30, cacheEverything: true },   // soften the rate limits these APIs enforce
    });
  } catch (err) {
    return json({ error: String(err) }, 502);
  }

  if (!upstream.ok) {
    return json({ error: `upstream ${upstream.status} ${upstream.statusText}` }, upstream.status);
  }

  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.delete('set-cookie');
  return new Response(upstream.body, { status: 200, headers });
}

export const onRequestOptions = () =>
  new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
