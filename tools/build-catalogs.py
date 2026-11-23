"""Build public catalog page images, verified SKU index and downloadable PDFs.

Usage: PYTHONPATH=... python3 tools/build-catalogs.py NAVIDAD.pdf AGENDAS.pdf
Requires PyMuPDF and Pillow. Original PDFs are supplied outside the repository.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from PIL import Image
import pymupdf

ROOT = Path(__file__).resolve().parents[1] / 'catalogos'
SKU_NAV = re.compile(r'\b(?:A\d{4}|BMT\d{4}|BMP\d{4})$')
SKU_AGE = re.compile(r'^(A[A-Z]{0,3}2027|AD2027)\s*\|\s*(.+)$')


def products_for(page, slug):
    products = []
    for raw in page.get_text().splitlines():
        line = raw.strip()
        if slug == 'navidad-2026':
            match = SKU_NAV.search(line)
            if match and len(line) <= 70:
                title = line[:match.start()].strip(' |')
                if title and title[0].isupper():
                    products.append({'sku': match.group(), 'name': title})
        else:
            match = SKU_AGE.match(line)
            if match:
                products.append({'sku': match.group(1), 'name': match.group(2).title()})
    return products


def render(page, out, width):
    scale = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    img.save(out, 'WEBP', quality=77 if width > 500 else 62, method=5)


def build(pdf_path, slug):
    source = pymupdf.open(pdf_path)
    out = ROOT / slug
    out.mkdir(parents=True, exist_ok=True)
    indices = [i for i in range(len(source)) if not (slug == 'navidad-2026' and i == 55)]
    pages = []
    for index in indices:
        page = source[index]
        number = index + 1
        full = f'pages/{number:02}.webp'
        small = f'previews/{number:02}.webp'
        (out / 'pages').mkdir(exist_ok=True)
        (out / 'previews').mkdir(exist_ok=True)
        wide = page.rect.width > page.rect.height
        render(page, out / full, 1800 if wide else 1100)
        render(page, out / small, 360 if wide else 280)
        category = 'Agendas semanales' if slug == 'agendas-2027' and number <= 6 else 'Agendas diarias' if slug == 'agendas-2027' else next((name for start, name in [(54, 'Escritura'), (53, 'Viaje'), (51, 'Salud'), (49, 'Oficina'), (44, 'Tecnología'), (35, 'Textiles'), (17, 'Hogar'), (4, 'Bebidas')] if number >= start), 'Introducción')
        pages.append({'number': number, 'image': full, 'preview': small,
                      'wide': wide, 'category': category, 'products': products_for(page, slug)})
    selected = pymupdf.open()
    selected.insert_pdf(source, from_page=0, to_page=len(source)-1)
    if slug == 'navidad-2026':
        selected.delete_page(55)
    selected.save(out / 'catalogo.pdf', garbage=4, deflate=True)
    selected.close()
    source.close()
    (out / 'pages.json').write_text(json.dumps({'slug': slug, 'pdf': 'catalogo.pdf', 'pages': pages}, ensure_ascii=False, indent=2) + '\n')
    print(slug, len(pages), 'pages', sum(len(p['products']) for p in pages), 'product references')
    return {str(page['number']): {product['sku']: product['name'] for product in page['products']}
            for page in pages}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: build-catalogs.py NAVIDAD.pdf AGENDAS.pdf')
    product_index = {
        'navidad-2026': build(sys.argv[1], 'navidad-2026'),
        'agendas-2027': build(sys.argv[2], 'agendas-2027'),
    }
    (ROOT.parent / 'api/_lib/catalog-products.js').write_text(
        '/* Generado desde pages.json por tools/build-catalogs.py. */\n'
        'export const CATALOG_PRODUCTS = ' +
        json.dumps(product_index, ensure_ascii=False, separators=(',', ':')) + ';\n'
    )
