#!/usr/bin/env python3
"""tools/crop-mockup-sheet.py — recorta un sheet compuesto (varios ángulos en
una sola imagen) en paneles individuales.

Sólo recorta y guarda cada panel con el alfa tal cual venía: NO tiñe, NO pasa
a escala de grises, NO redimensiona. Eso lo hace tools/mockup-cutout.swift
después, un panel a la vez (ver CLAUDE.md § "Mockups de prenda").

Uso:
    python3 tools/crop-mockup-sheet.py <out_dir>

Los bounding boxes de abajo se AJUSTARON visualmente sobre las dos imágenes
fuente (ver docs/superpowers/specs si se documenta el origen); si se vuelve a
usar con un sheet nuevo, revisar cada bounding box abriendo el recorte
intermedio antes de pasarlo a mockup-cutout.swift — un recorte torcido no se
nota hasta que se ve el PNG.
"""
import sys
from pathlib import Path
from PIL import Image

SRC_DIR = Path(
    "/Users/aguerrerogar/Documents/Documentos - MacBook Air de Alan/"
    "proyectos desarrollo propio/Multimedia Grafik/Imagenes para estudio"
)

SHEETS = {
    "gorra": {
        "path": SRC_DIR / "Imagen de Codex 22 sept 2026, 09_54_40 a.m..png",
        # Grid 3 columnas x 2 filas, pero NO alineado a 512x512 exacto: las
        # columnas están separadas por canaletas de transparencia real en
        # x=[524,565] y x=[971,1011] (medido perfilando alpha>200 por columna
        # con tools/, no a ojo). Fila 1 = izquierdo/frente/derecho (se usa).
        # Fila 2 = atrás/superior/inferior (se descarta, no se recorta).
        # Fila 1 tiene: gorra 56<=y<=412, luego el rótulo horneado
        # ("LADO IZQUIERDO" etc.) en 418<=y<=428, luego canaleta real hasta
        # y=461 donde arranca la fila 2. bottom=415 cae entre el fin de la
        # gorra (412) y el inicio del rótulo (418): excluye el texto con
        # margen y deja de sobra antes de la fila 2 (461).
        "crops": {
            "left":  (0,   0, 544, 415),
            "front": (544, 0, 991, 415),
            "right": (991, 0, 1536, 415),
        },
    },
    "playera": {
        "path": SRC_DIR / "Imagen de Codex 22 sept 2026, 09_54_46 a.m..png",
        # Split limpio 887x887 cada panel (1774x887 total), sin texto horneado.
        "crops": {
            "front": (0,   0, 887,  887),
            "back":  (887, 0, 1774, 887),
        },
    },
}


def main():
    if len(sys.argv) != 2:
        print(f"Uso: {sys.argv[0]} <out_dir>", file=sys.stderr)
        sys.exit(1)
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)

    for prenda, cfg in SHEETS.items():
        im = Image.open(cfg["path"])
        print(f"{prenda}: {cfg['path'].name} — {im.size[0]}x{im.size[1]} {im.mode}")
        for slug, box in cfg["crops"].items():
            crop = im.crop(box)
            out_path = out_dir / f"{prenda}-{slug}-raw.png"
            crop.save(out_path)
            print(f"  {slug}: bbox={box} -> {out_path.name} ({crop.size[0]}x{crop.size[1]})")


if __name__ == "__main__":
    main()
