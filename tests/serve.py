"""Servidor estático para los tests e2e (Playwright `webServer`).

Mismo comportamiento que `python3 -m http.server`, con una cola de conexiones
pendientes amplia. El estudio carga ~25 módulos ES en ráfaga; con la cola por
defecto (request_queue_size = 5) el sistema reseteaba conexiones
(net::ERR_CONNECTION_RESET) en ~1 de cada 50 arranques y la página se quedaba en
el esqueleto de carga, lo que parecía un fallo del código.

Uso: python3 tests/serve.py <puerto>
"""
import sys
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # El servidor hermético no monta Vercel Functions. El acceso opcional
        # está apagado en estos tests salvo donde Playwright falsea la API.
        if self.path == "/api/quote-intent":
            body = json.dumps({"enabled": False}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


class Servidor(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    Servidor(("127.0.0.1", puerto), Handler).serve_forever()
