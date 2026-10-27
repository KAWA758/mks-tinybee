"""Serve web/ on http://localhost:8000 with caching disabled.

Web Serial needs localhost or HTTPS. Plain `python -m http.server` lets the
browser keep old copies of app.js after a git pull; this server forbids that.
"""
import argparse
import functools
import http.server
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / 'web'


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--port', type=int, default=8000)
    options = parser.parse_args()
    handler = functools.partial(NoCacheHandler, directory=str(WEB))
    with http.server.ThreadingHTTPServer(('127.0.0.1', options.port), handler) as server:
        print('Open http://localhost:{}  (simulator: http://localhost:{}/?sim)  Ctrl+C stops'.format(options.port, options.port))
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
