#!/usr/bin/env python3
"""Awaremap dev server.

Serves the static app and adds one narrow, read-only proxy endpoint for the
handful of upstream APIs that refuse browser CORS (live aircraft, news, FAA).
Only GET, only https, only the hosts in ALLOWED.
"""
import json
import sys
import os
import urllib.parse
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ALLOWED = {
    'api.adsb.lol',            # live aircraft positions
    'opendata.adsb.fi',        # aircraft fallback mirror
    'opensky-network.org',     # aircraft fallback mirror
    'api.gdeltproject.org',    # local news coverage
    'aviationweather.gov',     # NOAA METARs + pilot reports
}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Dev server: never let the browser cache the app, or an edit silently
        # fails to show up and you debug a file that isn't the one running.
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/api/proxy'):
            return self.proxy()
        return super().do_GET()

    def proxy(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if 'ping' in q:
            return self.reply_json(200, {'ok': True, 'hosts': sorted(ALLOWED)})

        url = (q.get('url') or [''])[0]
        parts = urllib.parse.urlparse(url)
        if parts.scheme != 'https' or parts.hostname not in ALLOWED:
            return self.reply_json(403, {'error': 'host not allowed', 'host': parts.hostname})

        req = urllib.request.Request(url, headers={
            'User-Agent': 'awaremap/1.0 (local dev)',
            'Accept': 'application/json',
        })
        try:
            with urllib.request.urlopen(req, timeout=25) as up:
                body = up.read()
                ctype = up.headers.get('Content-Type', 'application/json')
        except urllib.error.HTTPError as e:
            return self.reply_json(e.code, {'error': f'upstream {e.code} {e.reason}'})
        except Exception as e:                                  # noqa: BLE001
            return self.reply_json(502, {'error': str(e)})

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def reply_json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f'Awaremap → http://localhost:{port}   (proxying {len(ALLOWED)} CORS-blocked APIs)')
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
