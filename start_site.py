from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = 8765

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(fmt % args)

url = f"http://127.0.0.1:{PORT}/"
server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print("GlowGuide is running at", url)
print("Keep this window open while using the website. Press Ctrl+C to stop.")
threading.Timer(1, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nGlowGuide stopped.")
finally:
    server.server_close()
