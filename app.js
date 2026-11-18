/* Awaremap — a live map of what's going on nearby.
   Every source below is keyless and CORS-open except the two optional key feeds.

   MARKERS                                     PILLS
     NWS active alerts        weather.gov        Open-Meteo current + next hours
     USGS earthquakes         earthquake.usgs    Open-Meteo air quality (US AQI)
     NASA EONET hazards       eonet.gsfc.nasa    sunrisesunset.io sun times
     USGS elevated volcanoes  volcanoes.usgs     NOAA CO-OPS tides (nearest station)
     OSM places (Overpass)    overpass-api.de
     Wikipedia geosearch      en.wikipedia.org  GEOCODING
     Wikimedia Commons photos commons.wikimedia   Nominatim search + reverse
     OpenStreetMap notes      api.openstreetmap
     iNaturalist sightings    api.inaturalist    OPTIONAL (key in Settings)
     GBIF occurrences         api.gbif.org        Ticketmaster Discovery events
     USGS water gauges        waterservices.usgs  TomTom traffic incidents
     Open Brewery DB          openbrewerydb.org
*/

const CATS = {
  alert:   { label: 'Alerts',     icon: '⚠', color: '#ff5d5d' },
  traffic: { label: 'Traffic',    icon: '⛔', color: '#cae268' },
  quake:   { label: 'Quakes',     icon: '〰', color: '#8b291c' },
  hazard:  { label: 'Hazards',    icon: '🔥', color: '#ff5d70' },
  event:   { label: 'Events',     icon: '★', color: '#88630e' },
  place:   { label: 'Places',     icon: '●', color: '#43d17a' },
  brew:    { label: 'Breweries',  icon: '🍺', color: '#d9a066' },
  wiki:    { label: 'Facts',      icon: 'W', color: '#a78bfa' },
  photo:   { label: 'Photos',     icon: '▣', color: '#e879f9' },
  note:    { label: 'Map notes',  icon: '✎', color: '#94a3b8' },
  wild:    { label: 'Wildlife',   icon: '🐦', color: '#b5e853' },
  water:   { label: 'Water',      icon: '≈', color: '#38bdf8' },
  flight:  { label: 'Aircraft',   icon: '✈', color: '#60a5fa' },
  news:    { label: 'News',       icon: '📰', color: '#f59e0b' },
  civic:   { label: '911 / 311',  icon: '🚨', color: '#f87171' },
  radio:   { label: 'Radio',      icon: '📻', color: '#c084fc' },
  edit:    { label: 'Map edits',  icon: '✦', color: '#14b8a6' },
  airfield:{ label: 'Airfields',  icon: '🛫', color: '#22d3ee' },
  fire:    { label: 'Wildfires',  icon: '🔥', color: '#ff4d00' },
  transit: { label: 'Transit',    icon: '🚉', color: '#34d399' },
  bike:    { label: 'Bike share', icon: '🚲', color: '#fbbf24' },
  sensor:  { label: 'Air sensors',icon: '🔬', color: '#7dd3fc' },
};

/* Awaremap opens as a safety tool. Everything that is interesting rather than
   urgent lives behind the Explore button — still loaded, still one click away,
   just not the first thing someone sees when something is burning. */
const EXPLORE = new Set([
  'place', 'brew', 'wiki', 'photo', 'note', 'edit',
  'wild', 'radio', 'bike', 'transit', 'event', 'flight', 'airfield',
]);

const STATE = {
  center: { lat: 33.5017, lon: -117.6625 },     // San Juan Capistrano, CA — home ground
  label: 'San Juan Capistrano, CA',
  radiusKm: 5,
  items: [],
  ids: new Set(),
  off: new Set(EXPLORE),
  explore: false,
  status: {},
  updated: null,
  timer: null,
};

const $ = (id) => document.getElementById(id);
const key = (k) => localStorage.getItem('awaremap.' + k) || '';

/* ---------------------------------------------------------------- map --- */

const map = L.map('map', { zoomControl: true })
  .setView([STATE.center.lat, STATE.center.lon], 13);

// Esri's dark canvas, which needs no API key. CARTO's tiles now return an
// "API KEY REQUIRED" placeholder from any origin other than localhost, which is
// invisible in local development and breaks the moment the site is deployed.
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas';
L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
  maxNativeZoom: 16, maxZoom: 19,          // Esri stops rendering this basemap past z16
  attribution: '&copy; Esri · OpenStreetMap contributors',
}).addTo(map);
L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
  maxNativeZoom: 16, maxZoom: 19, pane: 'shadowPane',   // street and place labels
}).addTo(map);

const layer = L.layerGroup().addTo(map);
let meMarker = null, radiusRing = null;
map.on('contextmenu', (e) => setCenter(e.latlng.lat, e.latlng.lng, 'Dropped pin'));

/* ------------------------------------------------------------- helpers --- */

function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

function fmtWhen(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000, future = diff < 0, s = Math.abs(diff);
  if (s < 60) return 'just now';
  const u = s < 3600 ? `${Math.round(s / 60)}m`
    : s < 86400 ? `${Math.round(s / 3600)}h`
    : `${Math.round(s / 86400)}d`;
  return future ? `in ${u}` : `${u} ago`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function getJSON(url, opts) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  return text.trim() ? JSON.parse(text) : [];      // some feeds answer 200 with an empty body
}

/** The local dev server proxies the few APIs that refuse browser CORS. */
let proxyOK = false;
const PROXY = (url) => `/api/proxy?url=${encodeURIComponent(url)}`;
const viaProxy = (url) => {
  if (!proxyOK) throw new Error('proxy offline — run serve.py');
  return getJSON(PROXY(url));
};

async function detectProxy() {
  try {
    const r = await getJSON('/api/proxy?ping=1');
    proxyOK = !!r.ok;
  } catch { proxyOK = false; }
  renderSources();
  return proxyOK;
}

async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/** Bounding box (west, south, east, north) around the current center. */
function bbox({ lat, lon }, km) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
  return { w: lon - dLon, s: lat - dLat, e: lon + dLon, n: lat + dLat };
}

const daysAgoISO = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

/* ------------------------------------------------------- marker sources --- */

async function fetchAlerts({ lat, lon }) {
  let data;
  try {
    data = await getJSON(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { Accept: 'application/geo+json' } });
  } catch (err) {
    // NWS covers the US only and answers 400 "out of bounds" elsewhere. That is an
    // honest absence of coverage, not a broken feed, so report zero rows instead.
    if (/\b400\b/.test(err.message)) return [];
    throw err;
  }
  return (data.features || []).map((f, i) => {
    const p = f.properties;
    return {
      id: `a-${p.id || i}`, cat: 'alert', src: 'NWS',
      title: p.event || 'Weather alert',
      body: p.headline || (p.description || '').slice(0, 200),
      lat, lon, pinned: true,
      time: Date.parse(p.effective || p.sent) || null,
      url: p['@id'],
    };
  });
}

async function fetchQuakes({ lat, lon }, radiusKm) {
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    `&latitude=${lat}&longitude=${lon}&maxradiuskm=${Math.max(radiusKm, 150)}` +
    `&starttime=${new Date(Date.now() - 7 * 864e5).toISOString()}&orderby=time&limit=50`;
  const data = await getJSON(url);
  return data.features.map((f) => ({
    id: `q-${f.id}`, cat: 'quake', src: 'USGS', wide: true,
    title: `M${(f.properties.mag ?? 0).toFixed(1)} — ${f.properties.place || 'earthquake'}`,
    body: `Depth ${Math.round(f.geometry.coordinates[2])} km` +
      (f.properties.felt ? ` · ${f.properties.felt} felt reports` : ''),
    lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
    time: f.properties.time, url: f.properties.url,
  }));
}

async function fetchHazards(center, radiusKm) {
  const data = await getJSON(
    'https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&limit=300&days=45');

  // A cyclone arrives as dozens of track points that all share one event id. Keep the
  // most recent fix per event: the old code let the de-dupe in loadAll() keep whichever
  // point came first, which pinned storms to a days-old position and intensity.
  const latest = new Map();
  for (const f of data.features || []) {
    const g = f.geometry, p = f.properties;
    const c = g?.type === 'Point' ? g.coordinates
      : Array.isArray(g?.coordinates?.[0]?.[0]) ? g.coordinates[0][0] : null;
    if (!c) continue;
    const eventId = p.id || f.id;
    const when = Date.parse(p.date) || 0;
    const prev = latest.get(eventId);
    if (!prev || when > prev.when) latest.set(eventId, { c, p, when });
  }

  // How far away an event still matters depends on what it is. A cyclone two days out
  // is the whole point of the app; a wildfire 1,000 km away is just noise.
  const reachFor = (title) => title === 'Severe Storms' ? 2500
    : title === 'Volcanoes' ? 1500
    : title === 'Sea and Lake Ice' ? 1000
    : Math.max(radiusKm * 4, 500);

  return [...latest.entries()].map(([eventId, { c, p, when }]) => {
    const reach = reachFor(p.categories?.[0]?.title);
    const it = {
      id: `h-${eventId}`, cat: 'hazard', src: 'NASA EONET', wide: true,
      title: p.title,
      body: (p.categories?.[0]?.title || 'Natural event') +
        (p.magnitudeValue ? ` · ${p.magnitudeValue} ${p.magnitudeUnit || ''}` : ''),
      lat: c[1], lon: c[0],
      time: when || null,
      url: p.link || p.sources?.[0]?.url,
    };
    return haversineKm(center, it) <= reach ? it : null;
  }).filter(Boolean);
}

let volcanoCoords = null;      // vnum -> {lat, lon}, fetched once per session

async function fetchVolcanoes(center, radiusKm) {
  const data = await getJSON('https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes');
  if (!Array.isArray(data) || !data.length) return [];

  // getElevatedVolcanoes returns alert levels with no lat/lon at all, so every row was
  // being dropped by the coordinate guard. The GVP catalog supplies the positions.
  if (!volcanoCoords) {
    const gvp = await getJSON('https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP');
    volcanoCoords = new Map((gvp || []).map((v) =>
      [String(v.vnum), { lat: +v.latitude, lon: +v.longitude }]));
  }

  const reach = Math.max(radiusKm * 8, 800);
  return data.map((v) => {
    const pos = volcanoCoords.get(String(v.vnum));
    if (!pos || !Number.isFinite(pos.lat)) return null;
    const it = {
      id: `v-${v.vnum || v.volcano_name}`, cat: 'hazard', src: 'USGS Volcano', wide: true,
      title: `${v.volcano_name} — ${v.alert_level || 'elevated'}`,
      body: `Aviation color code ${v.color_code || '—'} · ${v.obs_fullname || ''}`,
      lat: pos.lat, lon: pos.lon,
      time: (v.sent_unixtime && v.sent_unixtime * 1000) || Date.parse(v.sent_utc) || null,
      url: v.notice_url || 'https://volcanoes.usgs.gov/',
    };
    return haversineKm(center, it) <= reach ? it : null;
  }).filter(Boolean);
}

async function fetchPlaces({ lat, lon }, radiusKm) {
  const r = Math.min(Math.round(radiusKm * 1000), 25000);
  const q = `[out:json][timeout:25];
(
  nwr["amenity"~"^(theatre|cinema|community_centre|marketplace|nightclub|bar|cafe|restaurant|library)$"](around:${r},${lat},${lon});
  nwr["leisure"~"^(park|stadium|sports_centre)$"](around:${r},${lat},${lon});
  nwr["tourism"~"^(museum|gallery|attraction)$"](around:${r},${lat},${lon});
);
out center 80;`;
  // Overpass mirrors rate-limit aggressively; fall through to the next one.
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.jp/api/interpreter',
  ];
  let data, lastErr;
  for (const host of MIRRORS) {
    try {
      data = await getJSON(host, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      break;
    } catch (err) { lastErr = err; }
  }
  if (!data) throw lastErr;

  return (data.elements || []).map((el) => {
    const p = el.center || el, t = el.tags || {};
    if (!t.name || p.lat == null) return null;
    const kind = t.amenity || t.leisure || t.tourism || 'place';
    return {
      id: `p-${el.type}-${el.id}`, cat: 'place', src: 'OpenStreetMap',
      title: t.name,
      body: kind.replace(/_/g, ' ') + (t.opening_hours ? ` · ${t.opening_hours}` : ''),
      lat: p.lat, lon: p.lon,
      url: t.website || `https://www.openstreetmap.org/${el.type}/${el.id}`,
    };
  }).filter(Boolean);
}

async function fetchWiki({ lat, lon }, radiusKm) {
  const r = Math.min(Math.round(radiusKm * 1000), 10000);   // API caps at 10 km
  const data = await getJSON('https://en.wikipedia.org/w/api.php?action=query&list=geosearch' +
    `&format=json&origin=*&gscoord=${lat}|${lon}&gsradius=${r}&gslimit=30`);
  return (data.query?.geosearch || []).map((g) => ({
    id: `w-${g.pageid}`, cat: 'wiki', src: 'Wikipedia',
    title: g.title, body: 'Wikipedia article about this spot',
    lat: g.lat, lon: g.lon,
    url: `https://en.wikipedia.org/?curid=${g.pageid}`,
  }));
}

async function fetchPhotos({ lat, lon }, radiusKm) {
  const r = Math.min(Math.round(radiusKm * 1000), 10000);
  const data = await getJSON('https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    `&origin=*&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${r}&ggslimit=25` +
    '&prop=coordinates|imageinfo&iiprop=url|extmetadata&iiurlwidth=240');
  return Object.values(data.query?.pages || {}).map((p) => {
    const c = p.coordinates?.[0], ii = p.imageinfo?.[0];
    if (!c) return null;
    return {
      id: `ph-${p.pageid}`, cat: 'photo', src: 'Wikimedia Commons',
      title: p.title.replace(/^File:/, '').replace(/\.(jpg|jpeg|png|webp)$/i, ''),
      body: 'Geotagged photo on Wikimedia Commons',
      lat: c.lat, lon: c.lon,
      thumb: ii?.thumburl,
      url: ii?.descriptionurl || `https://commons.wikimedia.org/?curid=${p.pageid}`,
    };
  }).filter(Boolean);
}

async function fetchNotes(center, radiusKm) {
  const b = bbox(center, Math.min(radiusKm, 25));
  const data = await getJSON('https://api.openstreetmap.org/api/0.6/notes.json' +
    `?bbox=${b.w.toFixed(4)},${b.s.toFixed(4)},${b.e.toFixed(4)},${b.n.toFixed(4)}&limit=40&closed=0`);
  return (data.features || []).map((f) => {
    const p = f.properties, first = p.comments?.[0];
    return {
      id: `n-${p.id}`, cat: 'note', src: 'OSM notes',
      title: (first?.text || 'Map note').split('\n')[0].slice(0, 80),
      body: `Open note · ${p.comments?.length || 1} comment(s)`,
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
      time: Date.parse((p.date_created || '').replace(' ', 'T') + 'Z') || null,
      url: `https://www.openstreetmap.org/note/${p.id}`,
    };
  });
}

async function fetchINat({ lat, lon }, radiusKm) {
  const data = await getJSON('https://api.inaturalist.org/v1/observations' +
    `?lat=${lat}&lng=${lon}&radius=${Math.min(Math.round(radiusKm), 200)}` +
    `&d1=${daysAgoISO(30)}&order_by=observed_on&per_page=30&photos=true`);
  return (data.results || []).map((o) => {
    const [oLat, oLon] = (o.location || '').split(',').map(Number);
    if (!Number.isFinite(oLat)) return null;
    const t = o.taxon || {};
    return {
      id: `i-${o.id}`, cat: 'wild', src: 'iNaturalist',
      title: t.preferred_common_name || t.name || o.species_guess || 'Wildlife sighting',
      body: `Seen by ${o.user?.login || 'someone'}${t.name ? ` · ${t.name}` : ''}`,
      lat: oLat, lon: oLon,
      thumb: t.default_photo?.square_url,
      time: Date.parse(o.observed_on_string || o.observed_on) || null,
      url: o.uri,
    };
  }).filter(Boolean);
}

async function fetchGbif({ lat, lon }, radiusKm) {
  const data = await getJSON('https://api.gbif.org/v1/occurrence/search?hasCoordinate=true' +
    `&geoDistance=${lat},${lon},${Math.min(Math.round(radiusKm), 100)}km` +
    `&eventDate=${daysAgoISO(120)},${daysAgoISO(0)}&limit=25`);
  return (data.results || []).map((o) => ({
    id: `g-${o.key}`, cat: 'wild', src: 'GBIF',
    title: o.species || o.scientificName || 'Species record',
    body: `${o.basisOfRecord || 'record'.toLowerCase()} · ${o.institutionCode || o.datasetName || 'GBIF'}`.toLowerCase(),
    lat: o.decimalLatitude, lon: o.decimalLongitude,
    time: Date.parse(o.eventDate) || null,
    url: `https://www.gbif.org/occurrence/${o.key}`,
  }));
}

async function fetchWater(center, radiusKm) {
  const b = bbox(center, Math.min(radiusKm, 60));
  const data = await getJSON('https://waterservices.usgs.gov/nwis/iv/?format=json' +
    `&bBox=${b.w.toFixed(3)},${b.s.toFixed(3)},${b.e.toFixed(3)},${b.n.toFixed(3)}` +
    '&parameterCd=00060,00065&siteStatus=active');
  const sites = new Map();
  for (const ts of data.value?.timeSeries || []) {
    const si = ts.sourceInfo, v = ts.values?.[0]?.value?.[0];
    const geo = si?.geoLocation?.geogLocation;
    if (!geo || !v) continue;
    const code = si.siteCode?.[0]?.value;
    const unit = ts.variable?.unit?.unitCode || '';
    const reading = `${ts.variable.variableName.split(',')[0]}: ${v.value} ${unit}`;
    const cur = sites.get(code) || {
      id: `wa-${code}`, cat: 'water', src: 'USGS Water',
      title: si.siteName, body: '', readings: [],
      lat: geo.latitude, lon: geo.longitude,
      time: Date.parse(v.dateTime) || null,
      url: `https://waterdata.usgs.gov/monitoring-location/${code}/`,
    };
    cur.readings.push(reading);
    cur.body = cur.readings.join(' · ');
    sites.set(code, cur);
  }
  return [...sites.values()];
}

async function fetchBreweries({ lat, lon }) {
  const data = await getJSON('https://api.openbrewerydb.org/v1/breweries' +
    `?by_dist=${lat},${lon}&per_page=15`);
  return (data || []).map((b) => {
    const bLat = Number(b.latitude), bLon = Number(b.longitude);
    if (!Number.isFinite(bLat)) return null;
    return {
      id: `b-${b.id}`, cat: 'brew', src: 'Open Brewery DB',
      title: b.name,
      body: `${(b.brewery_type || 'brewery').replace(/_/g, ' ')} · ${b.street || b.city || ''}`,
      lat: bLat, lon: bLon,
      url: b.website_url || `https://www.openbrewerydb.org/breweries/${b.id}`,
    };
  }).filter(Boolean);
}

async function fetchEvents({ lat, lon }, radiusKm) {
  const k = key('tmKey');
  if (!k) return [];
  const data = await getJSON('https://app.ticketmaster.com/discovery/v2/events.json' +
    `?apikey=${encodeURIComponent(k)}&latlong=${lat},${lon}` +
    `&radius=${Math.round(radiusKm)}&unit=km&sort=date,asc&size=50`);
  return (data._embedded?.events || []).map((e) => {
    const v = e._embedded?.venues?.[0];
    return {
      id: `e-${e.id}`, cat: 'event', src: 'Ticketmaster',
      title: e.name,
      body: [v?.name, e.classifications?.[0]?.segment?.name].filter(Boolean).join(' · '),
      lat: Number(v?.location?.latitude) || lat,
      lon: Number(v?.location?.longitude) || lon,
      thumb: e.images?.find((i) => i.width < 400)?.url,
      time: Date.parse(e.dates?.start?.dateTime || e.dates?.start?.localDate) || null,
      url: e.url,
    };
  });
}

async function fetchTraffic(center, radiusKm) {
  const k = key('ttKey');
  if (!k) return [];
  const b = bbox(center, Math.min(radiusKm, 50));
  const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,' +
    'magnitudeOfDelay,startTime,endTime,events{description}}}}';
  const data = await getJSON('https://api.tomtom.com/traffic/services/5/incidentDetails' +
    `?key=${encodeURIComponent(k)}&bbox=${b.w},${b.s},${b.e},${b.n}` +
    `&fields=${encodeURIComponent(fields)}&language=en-GB&timeValidityFilter=present`);
  return (data.incidents || []).map((inc, i) => {
    const g = inc.geometry, c = g?.type === 'Point' ? g.coordinates : g?.coordinates?.[0];
    if (!c) return null;
    const p = inc.properties || {};
    return {
      id: `t-${i}-${c[0]}`, cat: 'traffic', src: 'TomTom',
      title: p.events?.[0]?.description || 'Traffic incident',
      body: `Delay level ${p.magnitudeOfDelay ?? '—'}`,
      lat: c[1], lon: c[0],
      time: Date.parse(p.startTime) || null,
    };
  }).filter(Boolean);
}


async function fetchFlights({ lat, lon }, radiusKm) {
  const nm = Math.min(Math.round(radiusKm * 0.54) + 10, 250);
  let ac = null, lastErr;
  for (const url of [
    `https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`,
    `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${nm}`,
  ]) {
    try { ac = (await viaProxy(url)).ac; if (ac) break; } catch (e) { lastErr = e; }
  }
  if (!ac) throw lastErr || new Error('no aircraft data');

  return ac.filter((a) => Number.isFinite(a.lat)).map((a) => ({
    id: `f-${a.hex}`, cat: 'flight', src: 'ADS-B', wide: true,
    title: (a.flight || a.r || a.hex || 'aircraft').trim(),
    body: [a.t && `type ${a.t}`, Number.isFinite(a.alt_baro) && `${a.alt_baro.toLocaleString()} ft`,
      a.gs && `${Math.round(a.gs)} kt`, a.category === 'A7' && 'helicopter']
      .filter(Boolean).join(' · '),
    lat: a.lat, lon: a.lon,
    time: Date.now(),
    url: `https://globe.adsbexchange.com/?icao=${a.hex}`,
  }));
}

async function fetchNews({ lat, lon }) {
  const place = (STATE.label || '').split(',')[0].replace(/\(default\)/, '').trim();
  if (!place || place.length < 3) return [];
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc' +
    `?query=${encodeURIComponent(`"${place}"`)}&mode=artlist&maxrecords=25` +
    '&timespan=3d&sort=datedesc&format=json';
  // GDELT throttles hard; one patient retry turns most 429s into a result.
  let data;
  try {
    data = await viaProxy(url);
  } catch (err) {
    if (!/429/.test(err.message)) throw err;
    await new Promise((r) => setTimeout(r, 4000));
    data = await viaProxy(url);
  }
  return (data.articles || []).map((a, i) => ({
    id: `nw-${i}-${a.url?.slice(-24)}`, cat: 'news', src: 'GDELT', pinned: true,
    title: a.title, body: `${a.domain || ''} · mentions ${place}`,
    lat, lon,
    time: Date.parse((a.seendate || '').replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) || null,
    url: a.url,
  }));
}

/* City open-data endpoints (Socrata). Each is picked when you are near it. */
const CITIES = [
  {
    name: 'Seattle Fire 911', lat: 47.61, lon: -122.33,
    url: (lat, lon, m) => 'https://data.seattle.gov/resource/kzjm-xkqj.json' +
      `?$where=within_circle(report_location,${lat},${lon},${m})&$limit=60&$order=datetime DESC`,
    map: (r) => ({ title: r.type, body: r.address, time: Date.parse(r.datetime),
      lat: +r.latitude, lon: +r.longitude, id: r.incident_number || r.datetime + r.address }),
  },
  {
    name: 'SF Fire dispatch', lat: 37.7749, lon: -122.4194,
    url: (lat, lon, m) => 'https://data.sfgov.org/resource/nuek-vuh3.json' +
      `?$where=within_circle(case_location,${lat},${lon},${m})&$limit=60&$order=received_dttm DESC`,
    map: (r) => ({ title: r.call_type, body: `${r.address || ''} · ${r.call_final_disposition || 'active'}`,
      time: Date.parse(r.received_dttm),
      lat: +(r.case_location?.coordinates?.[1] ?? r.latitude),
      lon: +(r.case_location?.coordinates?.[0] ?? r.longitude), id: r.call_number }),
  },
  {
    name: 'NYC 311', lat: 40.7128, lon: -74.006,
    url: (lat, lon, m) => 'https://data.cityofnewyork.us/resource/erm2-nwe9.json' +
      `?$where=within_circle(location,${lat},${lon},${m})&$limit=60&$order=created_date DESC`,
    map: (r) => ({ title: r.complaint_type, body: `${r.descriptor || ''} · ${r.agency || ''}`,
      time: Date.parse(r.created_date), lat: +r.latitude, lon: +r.longitude, id: r.unique_key }),
  },
  {
    name: 'Chicago 311', lat: 41.8781, lon: -87.6298,
    url: (lat, lon, m) => 'https://data.cityofchicago.org/resource/v6vf-nfxy.json' +
      `?$where=within_circle(location,${lat},${lon},${m})&$limit=60&$order=created_date DESC`,
    map: (r) => ({ title: r.sr_type, body: `${r.status || ''} · ${r.owner_department || ''}`,
      time: Date.parse(r.created_date), lat: +r.latitude, lon: +r.longitude, id: r.sr_number }),
  },
  {
    name: 'Philly police incidents', lat: 39.9526, lon: -75.1652,
    url: (lat, lon, m) => 'https://phl.carto.com/api/v2/sql?q=' + encodeURIComponent(
      'SELECT text_general_code,dispatch_date_time,point_x,point_y FROM incidents_part1_part2 ' +
      "WHERE dispatch_date_time > (now() - interval '3 days') AND ST_DWithin(the_geom::geography, " +
      `ST_SetSRID(ST_Point(${lon},${lat}),4326)::geography, ${m}) LIMIT 60`),
    rows: (r) => r.rows,
    map: (r) => ({ title: r.text_general_code, body: 'Philadelphia Police incident report',
      time: Date.parse(r.dispatch_date_time), lat: +r.point_y, lon: +r.point_x,
      id: `${r.dispatch_date_time}-${r.point_x}` }),
  },
];

async function fetchCivic(center, radiusKm) {
  const city = CITIES.find((c) => haversineKm(center, c) < 60);
  if (!city) return [];
  const raw = await getJSON(city.url(center.lat, center.lon, Math.round(Math.min(radiusKm, 25) * 1000)));
  const rows = city.rows ? city.rows(raw) : raw;
  return (rows || []).map((r) => {
    const m = city.map(r);
    if (!Number.isFinite(m.lat) || !m.title) return null;
    return { ...m, id: `c-${m.id}`, cat: 'civic', src: city.name, time: m.time || null };
  }).filter(Boolean);
}

async function fetchRadio({ lat, lon }, radiusKm) {
  const rows = await getJSON('https://de1.api.radio-browser.info/json/stations/search' +
    `?geo_lat=${lat}&geo_long=${lon}&geo_distance=${Math.round(Math.min(radiusKm, 60) * 1000)}` +
    '&limit=25&hidebroken=true&order=clickcount&reverse=true');
  return (rows || []).filter((r) => r.geo_lat).map((r) => ({
    id: `r-${r.stationuuid}`, cat: 'radio', src: 'Radio Browser',
    title: r.name?.trim() || 'Station',
    body: [r.tags?.split(',').slice(0, 3).join(', '), r.bitrate && `${r.bitrate} kbps`]
      .filter(Boolean).join(' · '),
    lat: +r.geo_lat, lon: +r.geo_long,
    url: r.homepage || r.url_resolved,
  }));
}

async function fetchEdits(center, radiusKm) {
  const b = bbox(center, Math.min(radiusKm, 20));
  const xml = await getText('https://api.openstreetmap.org/api/0.6/changesets' +
    `?bbox=${b.w.toFixed(4)},${b.s.toFixed(4)},${b.e.toFixed(4)},${b.n.toFixed(4)}`);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.querySelectorAll('changeset')].slice(0, 30).map((cs) => {
    const g = (a) => cs.getAttribute(a);
    const lat = (+g('min_lat') + +g('max_lat')) / 2, lon = (+g('min_lon') + +g('max_lon')) / 2;
    if (!Number.isFinite(lat)) return null;
    const comment = [...cs.querySelectorAll('tag')].find((t) => t.getAttribute('k') === 'comment');
    return {
      id: `ed-${g('id')}`, cat: 'edit', src: 'OSM changesets',
      title: comment?.getAttribute('v') || 'Map edit',
      body: `by ${g('user')} · ${g('changes_count')} changes`,
      lat, lon,
      time: Date.parse(g('created_at')) || null,
      url: `https://www.openstreetmap.org/changeset/${g('id')}`,
    };
  }).filter(Boolean);
}

async function fetchMetars(center, radiusKm) {
  const b = bbox(center, Math.max(radiusKm, 40));
  const rows = await viaProxy('https://aviationweather.gov/api/data/metar?format=json' +
    `&bbox=${b.s.toFixed(2)},${b.w.toFixed(2)},${b.n.toFixed(2)},${b.e.toFixed(2)}`);
  return (rows || []).filter((m) => Number.isFinite(m.lat)).map((m) => ({
    id: `mt-${m.icaoId}`, cat: 'airfield', src: 'NOAA METAR', wide: true,
    title: `${m.icaoId} · ${flightCategory(m)}`,
    body: [m.temp != null && `${Math.round(m.temp * 9 / 5 + 32)}°F`,
      m.wspd != null && `wind ${m.wdir ?? '—'}° @ ${m.wspd} kt`,
      m.visib != null && `vis ${m.visib} mi`].filter(Boolean).join(' · '),
    lat: m.lat, lon: m.lon,
    time: (m.obsTime || 0) * 1000 || null,
    raw: m.rawOb,
    url: `https://aviationweather.gov/data/metar/?id=${m.icaoId}`,
  }));
}

/** Rough VFR/MVFR/IFR call from ceiling + visibility, the way pilots read it. */
function flightCategory(m) {
  const vis = parseFloat(String(m.visib).replace('+', ''));
  const ceil = (m.clouds || []).filter((c) => ['BKN', 'OVC'].includes(c.cover))
    .map((c) => c.base).filter((b) => b != null).sort((a, b) => a - b)[0];
  if ((ceil != null && ceil < 500) || vis < 1) return 'LIFR';
  if ((ceil != null && ceil < 1000) || vis < 3) return 'IFR';
  if ((ceil != null && ceil < 3000) || vis < 5) return 'MVFR';
  return 'VFR';
}

async function fetchPireps(center, radiusKm) {
  // PIREPs are queried by station, so anchor on the nearest reporting airfield.
  const b = bbox(center, 120);
  const stations = await viaProxy('https://aviationweather.gov/api/data/metar?format=json' +
    `&bbox=${b.s.toFixed(2)},${b.w.toFixed(2)},${b.n.toFixed(2)},${b.e.toFixed(2)}`);
  let anchor = null;
  for (const m of stations || []) {
    if (!Number.isFinite(m.lat)) continue;
    const d = haversineKm(center, m);
    if (!anchor || d < anchor.d) anchor = { id: m.icaoId, d };
  }
  if (!anchor) return [];

  let rows;
  try {
    rows = await viaProxy('https://aviationweather.gov/api/data/pirep?format=json' +
      `&id=${anchor.id}&distance=${Math.min(Math.round(Math.max(radiusKm * 3, 150) * 0.54), 250)}&age=6`);
  } catch (err) {
    if (/\b400\b/.test(err.message)) return [];   // station id not valid for PIREPs
    throw err;
  }
  return (rows || []).filter((p) => Number.isFinite(p.lat)).map((p, i) => ({
    id: `pr-${p.obsTime || i}-${p.lat}`, cat: 'airfield', src: 'Pilot report', wide: true,
    title: `Pilot report${p.fltLvl ? ` at FL${p.fltLvl}` : ''}${p.acType ? ` · ${p.acType}` : ''}`,
    body: (p.rawOb || '').slice(0, 140),
    lat: p.lat, lon: p.lon,
    time: (p.obsTime || 0) * 1000 || null,
  }));
}


async function fetchFires(center, radiusKm) {
  const b = bbox(center, Math.max(radiusKm * 6, 300));
  const data = await getJSON(
    'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
    'WFIGS_Incident_Locations_Current/FeatureServer/0/query?f=geojson&where=1%3D1&outFields=*' +
    `&geometry=${b.w.toFixed(3)},${b.s.toFixed(3)},${b.e.toFixed(3)},${b.n.toFixed(3)}` +
    '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects' +
    '&resultRecordCount=200');
  return (data.features || []).map((f) => {
    const p = f.properties, c = f.geometry?.coordinates;
    if (!c) return null;
    return {
      id: `fi-${p.UniqueFireIdentifier || p.OBJECTID}`, cat: 'fire', src: 'NIFC / WFIGS', wide: true,
      title: p.IncidentName || 'Wildfire incident',
      body: [(p.IncidentSize ?? p.DailyAcres ?? p.DiscoveryAcres) &&
          `${Math.round(p.IncidentSize ?? p.DailyAcres ?? p.DiscoveryAcres).toLocaleString()} acres`,
        p.PercentContained != null && `${p.PercentContained}% contained`,
        p.IncidentTypeCategory === 'WF' ? 'wildfire' : 'incident'].filter(Boolean).join(' · '),
      lat: c[1], lon: c[0],
      time: p.FireDiscoveryDateTime || null,
      url: 'https://inciweb.wildfire.gov/',
    };
  }).filter(Boolean);
}

async function fetchStormReports(center, radiusKm) {
  const csv = await getText('https://www.spc.noaa.gov/climo/reports/today.csv');
  const reach = Math.max(radiusKm * 4, 400);
  let kind = 'Tornado';
  return csv.split('\n').map((line, i) => {
    const cols = line.split(',');
    if (cols[0] === 'Time') {                       // section header switches the report type
      kind = cols[1] === 'F_Scale' ? 'Tornado' : cols[1] === 'Size' ? 'Hail' : 'Wind';
      return null;
    }
    if (cols.length < 8) return null;
    const lat = +cols[5], lon = +cols[6];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const it = {
      id: `sp-${i}-${lat}-${lon}`, cat: 'hazard', src: 'SPC storm reports', wide: true,
      title: `${kind} report — ${cols[2] || 'unknown location'}`,
      body: `${cols[1] ? `${cols[1]} · ` : ''}${cols[3] || ''} County, ${cols[4] || ''} · ${(cols[7] || '').slice(0, 90)}`,
      lat, lon,
      url: 'https://www.spc.noaa.gov/climo/reports/today.html',
    };
    return haversineKm(center, it) <= reach ? it : null;
  }).filter(Boolean);
}

async function fetchEmsc(center, radiusKm) {
  const deg = Math.max(radiusKm, 200) / 111;
  const data = await getJSON('https://www.seismicportal.eu/fdsnws/event/1/query?format=json' +
    `&lat=${center.lat}&lon=${center.lon}&maxradius=${deg.toFixed(2)}` +
    `&start=${daysAgoISO(14)}&limit=40&orderby=time`);
  return (data.features || []).map((f) => {
    const p = f.properties, c = f.geometry.coordinates;
    return {
      id: `em-${p.unid || p.source_id}`, cat: 'quake', src: 'EMSC', wide: true,
      title: `M${(p.mag ?? 0).toFixed(1)} — ${p.flynn_region || 'earthquake'}`,
      body: `Depth ${Math.round(p.depth || 0)} km · European-Mediterranean Seismological Centre`,
      lat: c[1], lon: c[0],
      time: Date.parse(p.time) || null,
      url: `https://www.seismicportal.eu/eventdetails.html?unid=${p.unid}`,
    };
  });
}

async function fetchSensors({ lat, lon }, radiusKm) {
  const rows = await getJSON('https://data.sensor.community/airrohr/v1/filter/' +
    `area=${lat.toFixed(4)},${lon.toFixed(4)},${Math.min(Math.round(radiusKm), 50)}`);
  const bySensor = new Map();
  for (const r of rows || []) {
    const l = r.location;
    if (!l || !Number.isFinite(+l.latitude)) continue;
    const vals = Object.fromEntries((r.sensordatavalues || []).map((v) => [v.value_type, v.value]));
    bySensor.set(r.sensor?.id, {
      id: `se-${r.sensor?.id}`, cat: 'sensor', src: 'sensor.community',
      title: `Sensor ${r.sensor?.id} · ${r.sensor?.sensor_type?.name || ''}`.trim(),
      body: [vals.P2 && `PM2.5 ${(+vals.P2).toFixed(1)}`, vals.P1 && `PM10 ${(+vals.P1).toFixed(1)}`,
        vals.temperature && `${(+vals.temperature).toFixed(1)}°C`,
        vals.humidity && `${Math.round(+vals.humidity)}% RH`].filter(Boolean).join(' · ') || 'citizen air sensor',
      lat: +l.latitude, lon: +l.longitude,
      time: Date.parse((r.timestamp || '').replace(' ', 'T') + 'Z') || null,
      url: `https://maps.sensor.community/#13/${l.latitude}/${l.longitude}`,
    });
  }
  return [...bySensor.values()];
}

/* Live transit, per agency, where the agency publishes an open JSON API. */
async function fetchMbta(center, radiusKm) {
  const deg = (Math.min(radiusKm, 15) / 111).toFixed(4);
  const stops = await getJSON('https://api-v3.mbta.com/stops' +
    `?filter[latitude]=${center.lat}&filter[longitude]=${center.lon}&filter[radius]=${deg}` +
    '&page[limit]=25&sort=distance');
  const ids = (stops.data || []).map((s) => s.id);
  if (!ids.length) return [];
  const next = new Map();
  try {
    const preds = await getJSON('https://api-v3.mbta.com/predictions' +
      `?filter[stop]=${ids.slice(0, 25).join(',')}&page[limit]=100&sort=departure_time`);
    for (const p of preds.data || []) {
      const stop = p.relationships?.stop?.data?.id;
      const t = p.attributes?.departure_time || p.attributes?.arrival_time;
      if (stop && t && !next.has(stop)) next.set(stop, Date.parse(t));
    }
  } catch { /* predictions are best-effort */ }

  return (stops.data || []).map((s) => {
    const a = s.attributes;
    const t = next.get(s.id);
    return {
      id: `mb-${s.id}`, cat: 'transit', src: 'MBTA',
      title: a.name,
      body: t ? `next departure ${fmtWhen(t)}` : (a.description || 'MBTA stop'),
      lat: a.latitude, lon: a.longitude,
      time: t || null,
      url: `https://www.mbta.com/stops/${encodeURIComponent(s.id)}`,
    };
  });
}

async function fetchBart(center) {
  const K = 'MW9S-E7SL-26DU-VV8V';                 // BART's documented public demo key
  const [stns, etds] = await Promise.all([
    getJSON(`https://api.bart.gov/api/stn.aspx?cmd=stns&key=${K}&json=y`),
    getJSON(`https://api.bart.gov/api/etd.aspx?cmd=etd&orig=all&key=${K}&json=y`),
  ]);
  const departures = new Map();
  for (const s of etds.root?.station || []) {
    const first = s.etd?.[0]?.estimate?.[0];
    if (first) departures.set(s.abbr, `${s.etd[0].destination} in ${first.minutes} min`);
  }
  return (stns.root?.stations?.station || []).map((s) => ({
    id: `ba-${s.abbr}`, cat: 'transit', src: 'BART',
    title: s.name,
    body: departures.get(s.abbr) || 'BART station',
    lat: +s.gtfs_latitude, lon: +s.gtfs_longitude,
    url: `https://www.bart.gov/stations/${s.abbr}`,
  }));
}

const TRANSIT = [
  { lat: 42.3601, lon: -71.0589, reach: 60, fn: fetchMbta },
  { lat: 37.7749, lon: -122.4194, reach: 70, fn: fetchBart },
];

async function fetchTransit(center, radiusKm) {
  const agency = TRANSIT.find((t) => haversineKm(center, t) < t.reach);
  return agency ? agency.fn(center, radiusKm) : [];
}

/* GBFS bike share. Each entry is a system's auto-discovery document. */
const BIKES = [
  { lat: 40.73, lon: -73.99, url: 'https://gbfs.lyft.com/gbfs/2.3/bkn/gbfs.json', name: 'Citi Bike' },
  { lat: 37.77, lon: -122.42, url: 'https://gbfs.lyft.com/gbfs/2.3/bay/gbfs.json', name: 'Bay Wheels' },
  { lat: 41.88, lon: -87.63, url: 'https://gbfs.lyft.com/gbfs/2.3/chi/gbfs.json', name: 'Divvy' },
  { lat: 38.90, lon: -77.03, url: 'https://gbfs.lyft.com/gbfs/2.3/dca-cabi/gbfs.json', name: 'Capital Bikeshare' },
  { lat: 42.36, lon: -71.06, url: 'https://gbfs.lyft.com/gbfs/2.3/bos/gbfs.json', name: 'Bluebikes' },
  { lat: 45.52, lon: -122.68, url: 'https://gbfs.lyft.com/gbfs/2.3/pdx/gbfs.json', name: 'Biketown' },
  { lat: 45.50, lon: -73.57, url: 'https://gbfs.velobixi.com/gbfs/gbfs.json', name: 'BIXI Montréal' },
];

async function fetchBikes(center, radiusKm) {
  const sys = BIKES.find((b) => haversineKm(center, b) < 60);
  if (!sys) return [];
  const disc = await getJSON(sys.url);
  const feeds = disc.data?.en?.feeds || disc.data?.[Object.keys(disc.data)[0]]?.feeds || [];
  const find = (n) => feeds.find((f) => f.name === n)?.url;
  const infoUrl = find('station_information'), statusUrl = find('station_status');
  if (!infoUrl) return [];

  const [info, status] = await Promise.all([
    getJSON(infoUrl),
    statusUrl ? getJSON(statusUrl).catch(() => null) : null,
  ]);
  const live = new Map((status?.data?.stations || []).map((s) => [s.station_id, s]));

  return (info.data?.stations || []).map((s) => {
    const it = { lat: s.lat, lon: s.lon };
    if (haversineKm(center, it) > Math.min(radiusKm, 25)) return null;
    const l = live.get(s.station_id);
    return {
      id: `bk-${sys.name}-${s.station_id}`, cat: 'bike', src: sys.name,
      title: s.name,
      body: l ? `${l.num_bikes_available ?? 0} bikes · ${l.num_docks_available ?? 0} docks free`
        : `${s.capacity ?? '?'} docks`,
      lat: s.lat, lon: s.lon,
      time: l?.last_reported ? l.last_reported * 1000 : null,
      url: sys.url.replace(/gbfs\.json$/, ''),
    };
  }).filter(Boolean);
}

const FEEDS = [
  { k: 'nws',     name: 'NWS alerts',        fn: fetchAlerts },
  { k: 'tomtom',  name: 'TomTom traffic',    fn: fetchTraffic,    needs: 'ttKey' },
  { k: 'usgs',    name: 'USGS quakes',       fn: fetchQuakes },
  { k: 'eonet',   name: 'NASA EONET',        fn: fetchHazards },
  { k: 'volcano', name: 'USGS volcanoes',    fn: fetchVolcanoes },
  { k: 'tm',      name: 'Ticketmaster',      fn: fetchEvents,     needs: 'tmKey' },
  { k: 'osm',     name: 'OpenStreetMap',     fn: fetchPlaces },
  { k: 'brew',    name: 'Open Brewery DB',   fn: fetchBreweries },
  { k: 'wiki',    name: 'Wikipedia',         fn: fetchWiki },
  { k: 'commons', name: 'Wikimedia Commons', fn: fetchPhotos },
  { k: 'notes',   name: 'OSM notes',         fn: fetchNotes },
  { k: 'inat',    name: 'iNaturalist',       fn: fetchINat },
  { k: 'gbif',    name: 'GBIF',              fn: fetchGbif },
  { k: 'water',   name: 'USGS water',        fn: fetchWater },
  { k: 'civic',   name: 'City 911/311',      fn: fetchCivic },
  { k: 'radio',   name: 'Radio Browser',     fn: fetchRadio },
  { k: 'edits',   name: 'OSM changesets',    fn: fetchEdits },
  { k: 'adsb',    name: 'ADS-B aircraft',    fn: fetchFlights,    needs: 'proxy' },
  { k: 'gdelt',   name: 'GDELT news',        fn: fetchNews,       needs: 'proxy' },
  { k: 'metar',   name: 'NOAA METARs',       fn: fetchMetars,     needs: 'proxy' },
  { k: 'pirep',   name: 'Pilot reports',     fn: fetchPireps,     needs: 'proxy' },
  { k: 'nifc',    name: 'NIFC wildfires',    fn: fetchFires },
  { k: 'spc',     name: 'SPC storm reports', fn: fetchStormReports },
  { k: 'emsc',    name: 'EMSC quakes',       fn: fetchEmsc },
  { k: 'sensor',  name: 'sensor.community',  fn: fetchSensors },
  { k: 'transit', name: 'Transit (MBTA/BART)', fn: fetchTransit },
  { k: 'bikes',   name: 'GBFS bike share',   fn: fetchBikes },
];

/** A feed is ready when its key (or the local proxy) is available. */
function feedReady(f) {
  if (!f.needs) return true;
  return f.needs === 'proxy' ? proxyOK : !!key(f.needs);
}

/* --------------------------------------------------------------- pills --- */

const WMO = {
  0: ['Clear', '☀'], 1: ['Mostly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁'],
  45: ['Fog', '🌫'], 48: ['Rime fog', '🌫'], 51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'],
  55: ['Heavy drizzle', '🌦'], 56: ['Freezing drizzle', '🌧'], 57: ['Freezing drizzle', '🌧'],
  61: ['Light rain', '🌧'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
  66: ['Freezing rain', '🌧'], 67: ['Freezing rain', '🌧'], 77: ['Snow grains', '🌨'],
  85: ['Snow showers', '🌨'], 86: ['Heavy snow showers', '❄'],
  71: ['Light snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '❄'], 80: ['Showers', '🌦'],
  81: ['Showers', '🌦'], 82: ['Violent showers', '⛈'], 95: ['Thunderstorm', '⛈'],
  96: ['Thunderstorm', '⛈'], 99: ['Severe thunderstorm', '⛈'],
};

function aqiTone(aqi) {
  return aqi <= 50 ? '#43d17a' : aqi <= 100 ? '#ffd166' : aqi <= 150 ? '#f0883e' : '#ff5d5d';
}

function pill(id, icon, big, small, tone) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = `<span class="pi">${icon}</span>
    <div><div class="pv" ${tone ? `style="color:${tone}"` : ''}>${big}</div>
    <div class="ps">${small}</div></div>`;
}

async function loadWeather({ lat, lon }) {
  try {
    const w = await getJSON('https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&hourly=precipitation_probability&forecast_hours=6' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto');
    const c = w.current, [text, icon] = WMO[c.weather_code] || ['—', '·'];
    const pop = Math.max(...(w.hourly?.precipitation_probability || [0]));
    pill('pWeather', icon, `${Math.round(c.temperature_2m)}° ${esc(text)}`,
      `feels ${Math.round(c.apparent_temperature)}° · wind ${Math.round(c.wind_speed_10m)} mph · ${pop}% rain in 6h`);
  } catch { pill('pWeather', '·', 'Weather —', 'Open-Meteo unavailable'); }
}

async function loadAir({ lat, lon }) {
  try {
    const a = await getJSON('https://air-quality-api.open-meteo.com/v1/air-quality' +
      `?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,european_aqi&timezone=auto`);
    const c = a.current, aqi = c.us_aqi ?? c.european_aqi;
    const word = aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy (sensitive)' : 'Unhealthy';
    pill('pAir', '🌬', `AQI ${Math.round(aqi)} · ${word}`,
      `PM2.5 ${c.pm2_5 ?? '—'} µg/m³ · Open-Meteo`, aqiTone(aqi));
  } catch { pill('pAir', '🌬', 'Air —', 'air quality unavailable'); }
}

async function loadSun({ lat, lon }) {
  try {
    const s = (await getJSON(`https://api.sunrisesunset.io/json?lat=${lat}&lng=${lon}`)).results;
    pill('pSun', '🌇', `↑ ${s.sunrise} · ↓ ${s.sunset}`,
      `golden hour ${s.golden_hour} · ${s.day_length} of daylight`);
  } catch { pill('pSun', '🌇', 'Sun —', 'sunrisesunset.io unavailable'); }
}

let tideStations = null;
async function loadTide(center) {
  try {
    if (!tideStations) {
      const r = await getJSON('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json' +
        '?type=tidepredictions&units=english');   // fetched once, then cached for the session
      tideStations = (r.stations || []).map((s) => ({ id: s.id, name: s.name, lat: +s.lat, lon: +s.lng }));
    }
    let best = null;
    for (const s of tideStations) {
      const d = haversineKm(center, s);
      if (!best || d < best.d) best = { s, d };
    }
    if (!best || best.d > 80) { pill('pTide', '🌊', 'No tide station', 'nearest NOAA gauge is far inland'); return; }
    const co = (params) => getJSON('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter' +
      `?application=awaremap&station=${best.s.id}&datum=MLLW&units=english` +
      `&time_zone=lst_ldt&format=json&${params}`);

    let level = null;
    try {
      const t = await co('product=water_level&date=latest');
      const v = t.data?.[0];
      if (v) level = `${(+v.v).toFixed(1)} ft now`;
    } catch { /* station may be prediction-only */ }

    let next = '';
    try {
      const p = await co('product=predictions&interval=hilo&date=today');
      const now = Date.now();
      const up = (p.predictions || []).find((x) => Date.parse(x.t.replace(' ', 'T')) > now);
      if (up) next = ` · next ${up.type === 'H' ? 'high' : 'low'} ${up.t.slice(11)}`;
      if (!level && up) level = `${(+up.v).toFixed(1)} ft ${up.type === 'H' ? 'high' : 'low'}`;
    } catch { /* predictions unavailable */ }

    pill('pTide', '🌊', level || 'Tide —',
      `${esc(best.s.name)} · ${fmtDist(best.d)} away${next} · NOAA`);
  } catch { pill('pTide', '🌊', 'Tide —', 'NOAA CO-OPS unavailable'); }
}


async function loadISS(center) {
  try {
    const i = await getJSON('https://api.wheretheiss.at/v1/satellites/25544');
    const d = haversineKm(center, { lat: i.latitude, lon: i.longitude });
    const overhead = d < 1200;
    pill('pISS', '🛰', overhead ? 'ISS overhead now' : `ISS ${Math.round(d).toLocaleString()} km away`,
      `${Math.round(i.altitude)} km up · ${Math.round(i.velocity).toLocaleString()} km/h · wheretheiss.at`,
      overhead ? '#43d17a' : null);
  } catch { pill('pISS', '🛰', 'ISS —', 'position unavailable'); }
}

async function loadSpace(center) {
  try {
    const rows = await getJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
    const last = rows[rows.length - 1];
    const kp = Number(last.estimated_kp ?? last.kp_index);
    const lat = Math.abs(center.lat);
    const chance = kp >= 7 ? 'aurora possible at mid latitudes'
      : kp >= 5 ? (lat > 45 ? 'aurora possible tonight' : 'storm active, too far south')
      : 'quiet — no aurora expected';
    pill('pSpace', '🌌', `Kp ${kp.toFixed(1)}`, `${chance} · NOAA SWPC`,
      kp >= 5 ? '#43d17a' : null);
  } catch { pill('pSpace', '🌌', 'Kp —', 'space weather unavailable'); }
}

async function loadMarine({ lat, lon }) {
  try {
    const m = await getJSON('https://marine-api.open-meteo.com/v1/marine' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=wave_height,wave_period,sea_surface_temperature&length_unit=imperial&timezone=auto');
    const c = m.current || {};
    if (c.wave_height == null) { pill('pMarine', '🌊', 'Inland', 'no marine grid point here · Open-Meteo'); return; }
    pill('pMarine', '🏄', `${c.wave_height} ft waves`,
      `period ${c.wave_period ?? '—'} s · sea ${c.sea_surface_temperature ?? '—'}° · Open-Meteo`);
  } catch { pill('pMarine', '🏄', 'Waves —', 'marine forecast unavailable'); }
}

async function loadFlood({ lat, lon }) {
  try {
    const f = await getJSON('https://flood-api.open-meteo.com/v1/flood' +
      `?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_max&forecast_days=7`);
    const d = f.daily?.river_discharge?.[0];
    const peak = Math.max(...(f.daily?.river_discharge_max || [0]));
    if (d == null) { pill('pFlood', '💧', 'No river grid', 'nearest modelled river is far · Open-Meteo'); return; }
    pill('pFlood', '💧', `${d} m³/s river flow`,
      `7-day peak ${peak} m³/s · GloFAS via Open-Meteo`, peak > d * 2 ? '#f0883e' : null);
  } catch { pill('pFlood', '💧', 'River —', 'flood model unavailable'); }
}

async function loadAirport(center) {
  if (!proxyOK) { pill('pAirport', '🛫', 'Airfield —', 'aviation proxy unavailable'); return; }
  try {
    const b = bbox(center, 120);
    const rows = await viaProxy('https://aviationweather.gov/api/data/metar?format=json' +
      `&bbox=${b.s.toFixed(2)},${b.w.toFixed(2)},${b.n.toFixed(2)},${b.e.toFixed(2)}`);
    let best = null;
    for (const m of rows || []) {
      if (!Number.isFinite(m.lat)) continue;
      const d = haversineKm(center, m);
      if (!best || d < best.d) best = { m, d };
    }
    if (!best) { pill('pAirport', '🛫', 'No airfield', 'no reporting station within 120 km'); return; }
    const cat = flightCategory(best.m);
    pill('pAirport', '🛫', `${best.m.icaoId} · ${cat}`,
      `${(best.m.rawOb || '').slice(0, 46)}… · ${fmtDist(best.d)} away`,
      cat === 'VFR' ? '#43d17a' : cat === 'MVFR' ? '#ffd166' : '#ff5d5d');
  } catch { pill('pAirport', '🛫', 'Airfield —', 'NOAA aviation feed unavailable'); }
}

/* ---------------------------------------------------------------- load --- */

let loadToken = 0;

async function loadAll() {
  const token = ++loadToken;
  $('refreshBtn').classList.add('spinning');
  FEEDS.forEach((f) => (STATE.status[f.k] = feedReady(f) ? 'load' : ''));

  const center = STATE.center;
  STATE.items = [];
  STATE.ids = new Set();
  render();
  renderSources();

  loadWeather(center); loadAir(center); loadSun(center); loadTide(center);
  loadMarine(center); loadFlood(center); loadISS(center); loadSpace(center); loadAirport(center);

  // Each feed paints the moment it lands. Waiting for all 27 meant one slow source
  // (Overpass overseas, or GDELT backing off a 429) held the whole map at zero.
  await Promise.all(FEEDS.map(async (f) => {
    if (!feedReady(f)) return;
    try {
      const items = await f.fn(center, STATE.radiusKm);
      if (token !== loadToken) return;
      STATE.status[f.k] = 'ok';
      commit(items, center);
    } catch (err) {
      console.warn(`[awaremap] ${f.k} failed:`, err.message);
      if (token === loadToken) STATE.status[f.k] = 'err';
    } finally {
      if (token === loadToken) renderSources();
    }
  }));

  if (token !== loadToken) return;            // a newer load superseded this one
  STATE.updated = Date.now();
  $('refreshBtn').classList.remove('spinning');
  render();
}

/** Merge one feed's results into the live view, keeping the list distance-sorted. */
function commit(items, center) {
  const add = items
    .filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lon) &&
      !STATE.ids.has(it.id) && STATE.ids.add(it.id))
    .map((it) => ({ ...it, dist: haversineKm(center, it) }))
    .filter((it) => it.pinned || it.wide || it.dist <= STATE.radiusKm * 1.05);
  if (!add.length) return;
  STATE.items = STATE.items.concat(add).sort((x, y) => x.dist - y.dist);
  render();
}

/* -------------------------------------------------------------- render --- */

const visible = () => STATE.items.filter((it) => !STATE.off.has(it.cat));

function render() {
  renderChips(); renderFeed(); renderMarkers();
  const hidden = STATE.items.length - visible().length;
  $('countLabel').textContent = `${visible().length} nearby` +
    (hidden && !STATE.explore ? ` · ${hidden} more in Explore` : '');
  $('updatedLabel').textContent = STATE.updated ? `updated ${fmtWhen(STATE.updated)}` : '';
  $('placeLabel').textContent = STATE.label;
}

function renderChips() {
  const counts = {};
  STATE.items.forEach((it) => (counts[it.cat] = (counts[it.cat] || 0) + 1));
  const shown = Object.entries(CATS).filter(([cat]) => STATE.explore || !EXPLORE.has(cat));
  $('chips').innerHTML = shown.map(([cat, c]) => `
    <span class="chip ${STATE.off.has(cat) ? '' : 'on'}" data-cat="${cat}" style="color:${c.color}">
      <i class="dot"></i>${c.label}<span class="n">${counts[cat] || 0}</span>
    </span>`).join('');
}

/** Reveal or re-hide the non-safety layers as a group. */
function toggleExplore() {
  STATE.explore = !STATE.explore;
  EXPLORE.forEach((cat) => (STATE.explore ? STATE.off.delete(cat) : STATE.off.add(cat)));
  $('exploreBtn').classList.toggle('on', STATE.explore);
  $('exploreBtn').textContent = STATE.explore ? '▾ Explore' : '▸ Explore';
  render();
}

function renderFeed() {
  const items = visible(), feed = $('feed');
  if (!items.length) {
    feed.innerHTML = '<li class="empty">Nothing reported in this radius.<br>Try a wider radius or another spot.</li>';
    return;
  }
  feed.innerHTML = items.slice(0, 400).map((it) => `
    <li data-id="${esc(it.id)}" style="border-left-color:${CATS[it.cat].color}">
      ${it.thumb ? `<img class="thumb" src="${esc(it.thumb)}" alt="" loading="lazy">` : ''}
      <div class="txt">
        <div class="row1">
          <span class="t">${esc(it.title)}</span>
          <span class="d">${it.pinned ? 'here' : fmtDist(it.dist)}</span>
        </div>
        <div class="row2">${esc(it.body)}</div>
        <div class="row3">${CATS[it.cat].label}${it.time ? ` · ${fmtWhen(it.time)}` : ''} · ${esc(it.src)}</div>
      </div>
    </li>`).join('');
}

const popupHTML = (it) => `
  ${it.thumb ? `<img src="${esc(it.thumb)}" alt="" style="width:100%;border-radius:6px;margin-bottom:6px">` : ''}
  <h3>${esc(it.title)}</h3>
  <div class="muted">${esc(it.body)}</div>
  <div class="muted" style="margin-top:4px">${CATS[it.cat].label}${it.time ? ` · ${fmtWhen(it.time)}` : ''} · ${fmtDist(it.dist)} away · ${esc(it.src)}</div>
  ${it.url ? `<div style="margin-top:6px"><a href="${esc(it.url)}" target="_blank" rel="noopener">Open source ↗</a></div>` : ''}`;

const markerIndex = new Map();

function renderMarkers() {
  layer.clearLayers();
  markerIndex.clear();

  visible().forEach((it) => {
    const c = CATS[it.cat];
    const m = L.marker([it.lat, it.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="pin" style="background:${c.color}">${c.icon}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      }),
    }).bindPopup(popupHTML(it));
    m.addTo(layer);
    markerIndex.set(it.id, m);
  });

  const ll = [STATE.center.lat, STATE.center.lon];
  if (meMarker) map.removeLayer(meMarker);
  meMarker = L.marker(ll, {
    icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    zIndexOffset: 1000,
  }).addTo(map);

  if (radiusRing) map.removeLayer(radiusRing);
  radiusRing = L.circle(ll, {
    radius: STATE.radiusKm * 1000,
    color: '#4cc9f0', weight: 1, fillOpacity: 0.04, dashArray: '4 6',
  }).addTo(map);
}

function renderSources() {
  $('sources').innerHTML = FEEDS.map((f) => {
    const off = !feedReady(f);
    const why = f.needs === 'proxy' ? ' (proxy offline)' : ' (add key)';
    return `<span class="src ${off ? '' : STATE.status[f.k] || ''}"><i></i>${f.name}${off ? why : ''}</span>`;
  }).join('') +
    ['Open-Meteo', 'Open-Meteo Air', 'Open-Meteo Marine', 'Open-Meteo Flood',
      'sunrisesunset.io', 'NOAA tides', 'NOAA SWPC', 'wheretheiss.at', 'RainViewer', 'Nominatim']
      .map((n) => `<span class="src ok"><i></i>${n}</span>`).join('');
}


/* ---------------------------------------------------------------- radar --- */
/* RainViewer publishes a manifest of recent radar frames plus a short nowcast;
   each frame is its own tile layer, pre-added at zero opacity so the loop
   animates without re-fetching tiles. */
const radar = { frames: [], layers: [], i: 0, timer: null, on: false };

async function toggleRadar() {
  radar.on = !radar.on;
  $('radarBtn').classList.toggle('on', radar.on);
  $('radarTime').classList.toggle('hidden', !radar.on);

  clearInterval(radar.timer);
  radar.layers.forEach((l) => map.removeLayer(l));
  radar.layers = [];
  if (!radar.on) return;

  try {
    const d = await getJSON('https://api.rainviewer.com/public/weather-maps.json');
    radar.frames = [...(d.radar?.past || []).slice(-8), ...(d.radar?.nowcast || []).slice(0, 3)];
    radar.layers = radar.frames.map((f) =>
      L.tileLayer(`${d.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, {
        opacity: 0, zIndex: 400, maxNativeZoom: 7, maxZoom: 19,    // radar tiles are only rendered to z7
        attribution: 'Radar &copy; RainViewer',
      }).addTo(map));
    radar.i = 0;
    radarStep();
    radar.timer = setInterval(radarStep, 650);
  } catch {
    $('radarTime').textContent = 'radar unavailable';
  }
}

function radarStep() {
  if (!radar.layers.length) return;
  radar.layers.forEach((l, i) => l.setOpacity(i === radar.i ? 0.62 : 0));
  const f = radar.frames[radar.i];
  const t = new Date(f.time * 1000);
  const future = f.time * 1000 > Date.now();
  $('radarTime').innerHTML = `${future ? '<b>forecast</b> ' : ''}` +
    `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} · ` +
    `frame ${radar.i + 1}/${radar.layers.length} · RainViewer`;
  radar.i = (radar.i + 1) % radar.layers.length;
}

$('radarBtn').addEventListener('click', toggleRadar);
$('exploreBtn').addEventListener('click', toggleExplore);

/* --------------------------------------------------------------- input --- */

function setCenter(lat, lon, label) {
  STATE.center = { lat, lon };
  if (label) STATE.label = label;
  map.setView([lat, lon], map.getZoom() < 12 ? 14 : map.getZoom());
  loadAll();
}

$('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const cat = chip.dataset.cat;
  STATE.off.has(cat) ? STATE.off.delete(cat) : STATE.off.add(cat);
  render();
});

$('feed').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  document.querySelectorAll('.feed li').forEach((n) => n.classList.remove('active'));
  li.classList.add('active');
  const m = markerIndex.get(li.dataset.id);
  if (m) { map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.5 }); m.openPopup(); }
});

$('radius').addEventListener('change', (e) => { STATE.radiusKm = Number(e.target.value); loadAll(); });
$('refreshBtn').addEventListener('click', () => loadAll());
$('locateBtn').addEventListener('click', locate);

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('searchInput').value.trim();
  if (!q) return;
  $('placeLabel').textContent = 'Searching…';
  try {
    const r = await getJSON(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
    if (!r.length) { $('placeLabel').textContent = 'No match for that place'; return; }
    setCenter(Number(r[0].lat), Number(r[0].lon), r[0].display_name.split(',').slice(0, 2).join(','));
  } catch { $('placeLabel').textContent = 'Search failed'; }
});

function locate() {
  if (new URLSearchParams(location.search).has('demo')) {
    loadAll();                 // hold the default view — stable framing for recording
    return;
  }
  if (!navigator.geolocation) { loadAll(); return; }
  $('placeLabel').textContent = 'Locating…';

  // The permission prompt can hang indefinitely, so never let it gate the first
  // load: fall back to the default center, and re-center if a fix arrives later.
  let settled = false;
  const fallback = setTimeout(() => {
    if (settled) return;
    settled = true;
    STATE.label = 'San Juan Capistrano, CA';
    $('placeLabel').textContent = STATE.label;
    loadAll();
  }, 6000);

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      clearTimeout(fallback);
      settled = true;
      const { latitude: lat, longitude: lon } = pos.coords;
      setCenter(lat, lon, 'Your location');
      try {
        const r = await getJSON(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
        const a = r.address || {};
        STATE.label = [a.neighbourhood || a.suburb || a.city || a.town, a.state]
          .filter(Boolean).join(', ') || 'Your location';
        $('placeLabel').textContent = STATE.label;
      } catch { /* keep the generic label */ }
    },
    () => {
      clearTimeout(fallback);
      if (settled) return;
      settled = true;
      STATE.label = 'San Juan Capistrano, CA';
      loadAll();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/* ------------------------------------------------------------ settings --- */

$('settingsBtn').addEventListener('click', () => {
  $('tmKey').value = key('tmKey');
  $('ttKey').value = key('ttKey');
  $('autoRefresh').checked = localStorage.getItem('awaremap.auto') !== '0';
  $('settings').classList.remove('hidden');
});
$('settingsClose').addEventListener('click', () => $('settings').classList.add('hidden'));
$('settingsSave').addEventListener('click', () => {
  for (const f of ['tmKey', 'ttKey']) {
    const v = $(f).value.trim();
    v ? localStorage.setItem('awaremap.' + f, v) : localStorage.removeItem('awaremap.' + f);
  }
  localStorage.setItem('awaremap.auto', $('autoRefresh').checked ? '1' : '0');
  $('settings').classList.add('hidden');
  setupAutoRefresh();
  loadAll();
});

function setupAutoRefresh() {
  clearInterval(STATE.timer);
  if (localStorage.getItem('awaremap.auto') !== '0') {
    STATE.timer = setInterval(loadAll, 5 * 60 * 1000);
  }
}

/* ----------------------------------------------------------------- go! --- */

// Browsers restore form values across reloads even with autocomplete="off",
// so an old search term can reappear — and a stray submit sends the map somewhere
// unexpected mid-recording. Start every load with an empty box.
$('searchInput').value = '';

setupAutoRefresh();
renderSources();
detectProxy().then(locate);
setInterval(() => {
  if (STATE.updated) $('updatedLabel').textContent = `updated ${fmtWhen(STATE.updated)}`;
}, 30000);
