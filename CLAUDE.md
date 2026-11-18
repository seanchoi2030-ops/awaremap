# Awaremap — project context

## What this is
A single-page web map that shows what is happening around any point on Earth, built
from ~27 live public data feeds (government and open data). Vanilla JavaScript, Leaflet,
no framework, no build step. `serve.py` serves the files locally and proxies the five
APIs that refuse browser CORS requests.

Run it: `python3 serve.py 8777` → http://localhost:8777

## Why it exists
On 16 October 2026 the **Norte Fire** started in San Clemente, California — 570 acres,
six kilometres from the author's school, which was evacuated. Eight families they know
lost homes. During the fire the information was all public but scattered: CAL FIRE had
acreage, the National Weather Service had the wind warning, air quality was somewhere
else, evacuation zones somewhere else again. Awaremap is one screen instead of five tabs.

It works anywhere because the agencies it reads publish everywhere — a point that first
came up after Super Typhoon Ragasa (September 2025) hit the Philippines, Taiwan, Hong
Kong and China.

## Competition context — this is the active deadline
Submission to the **Congressional App Challenge**, Orange County, California.
**Due 9:00 pm ET Monday 26 October 2026 (6:00 pm Pacific)** — per the official email
sent to registrants, which supersedes the 12:00 pm time printed in the rules PDF.
Target: submit Saturday 24th. **Student is already registered.**

- Judged on a 30-point rubric: Concept (Ideology, Impact, Structure) /15 and
  Technology (Function, Code, UI) /15, each criterion 1–5.
- **Judges score the video, not the running app.** Four of six criteria are scored off
  it. The CODE criterion scores 1/5 if the video does not explain the code.
- Demo video: **3 minutes maximum**, public on YouTube or Vimeo.
- Source code is not a required upload, but judges may demand it; refusing is immediate
  disqualification.

## AI disclosure — important
Claude (Anthropic) was used substantially in building this project and **must be fully
disclosed** in the submission, the video, and this repository. The 2026 rules permit AI
only to "support specific aspects" and require the student to demonstrate "significant
individual contributions and technical understanding."

**Therefore: the remaining features are to be written by the student.** Any Claude session
working in this repo should explain, sketch, review and debug — not author the new
feature code. Teaching mode, not implementation mode.

## Current state
- Deployed at https://awaremap.seandabeegmac.workers.dev (Cloudflare Workers static
  upload). 24 of 27 feeds work there; aircraft, news and aviation weather need the proxy,
  which that uploader cannot run. All 27 work locally via `serve.py`.
- `functions/api/proxy.js` is a Cloudflare Pages Function port of the proxy. It is NOT
  deployed — the dashboard uploader rejects it. Deploying it needs the GitHub → Cloudflare
  Git integration route.
- Default map centre is San Juan Capistrano, CA — the town the author's school is in,
  and the town the Norte Fire burned into. `?demo` holds this view and skips
  geolocation so recordings are repeatable.
- Asset URLs are versioned (`app.js?v=3`) and serve.py sends `no-store`; without
  that the browser silently runs a stale app.js.
- Basemap is Esri dark canvas. Do not go back to CARTO: its tiles return an
  "API KEY REQUIRED" placeholder from any origin except localhost.

## Remaining plan before the deadline
1. **Cut**: move non-safety feeds (breweries, radio, bike share, transit, photos,
   iNaturalist, GBIF, map edits, aircraft, pilot reports) behind an "Explore" toggle,
   off by default. The app should open as a safety tool, not an API sampler.
2. **Watchlist** (student writes): named saved places — "my school", "my house" — in
   localStorage, each showing live status.
3. **Risk score** (student writes): one documented 0–100 number per watched place,
   computed from feeds already loaded — distance to nearest fire/storm, alert severity,
   AQI, flood percentile, quake magnitude with distance decay. Show the formula on screen.
   This is the single highest-value item: past winners in this genre won by computing a
   number that did not exist before, never by adding more data layers.
4. Read the whole codebase; be able to explain every part on camera.
5. Record, edit to under 3:00, upload public, submit.

## Known issues / gotchas already found and fixed
- EONET gives one event id across dozens of cyclone track points; de-duping naively keeps
  the oldest fix, which showed storms at stale positions and wrong intensities.
- WFIGS renamed its acreage field: use `IncidentSize`, not `DailyAcres`.
- The USGS elevated-volcano API carries no coordinates; they come from the GVP catalog.
- NWS and the PIREP endpoint return HTTP 400 outside their coverage — treat as empty,
  not as an error.
- Feeds render progressively; never await all of them before painting, or slow sources
  (Overpass overseas, GDELT backing off a 429) leave the map blank.
- Esri's dark basemap stops rendering past zoom 16; `maxNativeZoom: 16`.
