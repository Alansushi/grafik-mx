"""Preview local del Estudio con catálogo demo; sin escritura ni Supabase."""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CATALOG_FIXTURE = {"garments": [
    {"id": "11111111-1111-4111-8111-111111111111", "slug": "playera", "name": "Playera cuello redondo",
     "base_mockup_url": "/tests/fixtures/mockups/playera-front-v3.png", "print_area": {"x": .321, "y": .19, "width": .358, "height": .3},
     "canvas_size": {"width": 964, "height": 900}, "print_area_width_cm": 31.6, "allowed_sizes": ["S", "M", "L", "XL", "XXL"],
     "min_qty": 12, "max_qty": 1000, "variants": [{"id": "a1", "color_hex": "#FFFFFF", "color_name": "Blanco"}], "views": []},
    {"id": "33333333-3333-4333-8333-333333333333", "slug": "pulsera", "name": "Pulsera", "render_type": "bracelet",
     "base_mockup_url": "procedural:bracelet", "print_area": {"x": .12, "y": .2, "width": .76, "height": .17},
     "canvas_size": {"width": 1000, "height": 720}, "print_area_width_cm": None, "allowed_sizes": ["U"],
     "min_qty": 100, "max_qty": 100000, "variants": [{"id": "c1", "color_hex": "#D72E50", "color_name": "Rojo"}], "views": []},
    {"id": "44444444-4444-4444-8444-444444444444", "slug": "frazada", "name": "Frazada personalizada", "render_type": "blanket",
     "base_mockup_url": "/assets/estudio/frazada-personal.png", "print_area": {"x": 0, "y": 0, "width": 1, "height": 1},
     "canvas_size": {"width": 600, "height": 900}, "print_area_width_cm": None, "allowed_sizes": ["P", "I", "M"],
     "min_qty": 1, "max_qty": 1000, "variants": [{"id": "d1", "color_hex": "#D6D5D1", "color_name": "Felpa gris claro"}], "views": []},
], "techniques": [{"id": "t1", "slug": "dtf", "name": "DTF", "notes": "", "sort_order": 1}]}


class Handler(SimpleHTTPRequestHandler):
    def _json(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/quote-intent":
            return self._json({"enabled": False})
        if self.path == "/api/catalog":
            catalog = json.loads(json.dumps(CATALOG_FIXTURE))
            for garment in catalog["garments"]:
                if garment["slug"] == "frazada":
                    garment["blanket_sizes"] = [
                        {"code": "P", "name": "Personal", "widthCm": 100, "heightCm": 150, "priceCents": 41000,
                         "canvas": {"width": 600, "height": 900}, "mockup": "/assets/estudio/frazada-personal.png"},
                        {"code": "I", "name": "Individual", "widthCm": 200, "heightCm": 150, "priceCents": 53000,
                         "canvas": {"width": 1200, "height": 900}, "mockup": "/assets/estudio/frazada-individual.png"},
                        {"code": "M", "name": "Matrimonial", "widthCm": 220, "heightCm": 150, "priceCents": 63000,
                         "canvas": {"width": 1320, "height": 900}, "mockup": "/assets/estudio/frazada-matrimonial.png"},
                    ]
            return self._json(catalog)
        if self.path.startswith("/api/order-status"):
            return self._json({"error": "PREVIEW_ONLY"}, 404)
        return super().do_GET()

    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(size) or b"{}")
        if self.path == "/api/upload-url":
            draft = body.get("draftId", "demo")
            ext = "png" if body.get("kind") == "preview" else "png"
            path = f"2026/11/{draft}/{body.get('kind')}-{body.get('itemIndex', 0)}.{ext}"
            return self._json({"path": path, "upload_url": "/api/demo-upload", "token": "demo"})
        if self.path == "/api/submit-quote":
            return self._json({"short_code": "DEMO-123", "public_token": "00000000-0000-4000-8000-000000000001"}, 201)
        return self._json({"error": "PREVIEW_ONLY"}, 404)

    def do_PUT(self):
        self.send_response(200)
        self.end_headers()


class Server(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


Server(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8081), Handler).serve_forever()
