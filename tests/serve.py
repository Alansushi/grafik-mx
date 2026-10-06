"""Servidor estático para los tests e2e (Playwright `webServer`).

Mismo comportamiento que `python3 -m http.server`, con una cola de conexiones
pendientes amplia. El estudio carga ~25 módulos ES en ráfaga; con la cola por
defecto (request_queue_size = 5) el sistema reseteaba conexiones
(net::ERR_CONNECTION_RESET) en ~1 de cada 50 arranques y la página se quedaba en
el esqueleto de carga, lo que parecía un fallo del código.

Uso: python3 tests/serve.py <puerto>
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Servidor(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    Servidor(("127.0.0.1", puerto), SimpleHTTPRequestHandler).serve_forever()
