// Recorta la prenda del fondo y la deja en escala de grises con alfa.
//
// Usa VNGenerateForegroundInstanceMaskRequest — el mismo motor que la opción
// "Eliminar fondo" de Vista Previa — así que no hace falta instalar nada.
//
// La conversión a grises NO se delega a un filtro de Core Image: se hace píxel
// a píxel con los pesos de luminancia del W3C, porque garment-painter.js lee
// SÓLO el canal rojo como valor de sombreado. Si r, g y b no quedaran
// idénticos, el teñido saldría sesgado en silencio.
//
// ── Uso ───────────────────────────────────────────────────────────────────
//
//   DEVELOPER_DIR=/Library/Developer/CommandLineTools \
//   /Library/Developer/CommandLineTools/usr/bin/swiftc -O \
//     -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk \
//     tools/mockup-cutout.swift -o /tmp/mockup-cutout
//
//   MARGEN=0.05 /tmp/mockup-cutout foto.jpg playera-base.png 1200
//
// Se compila con el toolchain de Command Line Tools a propósito: el `swift` de
// /usr/bin apunta a Xcode.app y exige aceptar su licencia con sudo.
//
// Argumentos: <entrada> <salida.png> [altoDestino].
// MARGEN (variable de entorno, fracción del lado) añade borde transparente.
//
// Así se generó assets del bucket `mockups`. Ver la sección "Mockups de prenda"
// de CLAUDE.md para el procedimiento completo, incluido cómo recalibrar
// canvas_size y print_area después.

import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count == 3 || args.count == 4 else {
    FileHandle.standardError.write("uso: cutout <entrada> <salida.png> [altoDestino]\n".data(using: .utf8)!)
    exit(2)
}
let entrada = URL(fileURLWithPath: args[1])
let salida = URL(fileURLWithPath: args[2])
// El redimensionado va AQUÍ, antes del paso a grises, y no con sips después:
// el remuestreo de sips interpola cada canal por separado y deja r != g != b
// en los bordes y pliegues (24 173 píxeles en la primera prueba). Como
// garment-painter.js lee sólo el canal rojo, esos píxeles tendrían un valor de
// sombreado que no es su luminancia. Haciendo el paso a grises al final, la
// exactitud está garantizada por construcción.
let altoDestino = args.count == 4 ? Int(args[3]) : nil

// ── 1. Máscara de primer plano ────────────────────────────────────────────
let handler = VNImageRequestHandler(url: entrada, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])

guard let result = request.results?.first else {
    FileHandle.standardError.write("Vision no encontró ningún objeto en primer plano\n".data(using: .utf8)!)
    exit(1)
}

// croppedToInstancesExtent recorta ajustado a la prenda: es justo el recorte
// que queremos, y así no se hace a ojo en un segundo paso.
let masked = try result.generateMaskedImage(
    ofInstances: result.allInstances,
    from: handler,
    croppedToInstancesExtent: true
)

let ci = CIImage(cvPixelBuffer: masked)
let ctx = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
guard let cg = ctx.createCGImage(ci, from: ci.extent) else {
    FileHandle.standardError.write("no se pudo rasterizar la máscara\n".data(using: .utf8)!)
    exit(1)
}

// ── 2. A un búfer RGBA8 que podamos recorrer ──────────────────────────────
var w = cg.width, h = cg.height
if let destino = altoDestino, destino > 0, destino != h {
    w = Int((Double(cg.width) * Double(destino) / Double(cg.height)).rounded())
    h = destino
}

// Margen transparente alrededor. El recorte de Vision es ajustado a la prenda,
// así que sin esto la playera toca los cuatro bordes del stage y se lee como
// una foto cortada en vez de como un producto. El margen se expresa como
// fracción del lado, e IGUAL en los dos ejes para no alterar la proporción
// (de la que depende canvas_size).
let margen = ProcessInfo.processInfo.environment["MARGEN"].flatMap(Double.init) ?? 0
let dibujoW = w, dibujoH = h
let offX = Int((Double(w) * margen).rounded())
let offY = Int((Double(h) * margen).rounded())
w += offX * 2
h += offY * 2

var px = [UInt8](repeating: 0, count: w * h * 4)
guard let bmp = CGContext(
    data: &px, width: w, height: h,
    bitsPerComponent: 8, bytesPerRow: w * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else { exit(1) }
bmp.draw(cg, in: CGRect(x: offX, y: offY, width: dibujoW, height: dibujoH))

// ── 3. Escala de grises exacta, conservando el alfa ───────────────────────
// El búfer viene premultiplicado, así que en los bordes suaves r,g,b ya
// vienen atenuados por el alfa. Se des-premultiplica antes de calcular la
// luminancia y se vuelve a premultiplicar después: si no, el borde de la
// silueta se leería como un pliegue oscuro que no existe en la tela.
var opacos = 0
for i in stride(from: 0, to: px.count, by: 4) {
    let a = Int(px[i + 3])
    if a == 0 { px[i] = 0; px[i+1] = 0; px[i+2] = 0; continue }
    opacos += 1
    let inv = 255.0 / Double(a)
    let r = Double(px[i])     * inv
    let g = Double(px[i + 1]) * inv
    let b = Double(px[i + 2]) * inv
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    let gray = UInt8(max(0, min(255, (y * Double(a) / 255.0).rounded())))
    px[i] = gray; px[i + 1] = gray; px[i + 2] = gray
}

// ── 4. PNG ────────────────────────────────────────────────────────────────
guard let out = bmp.makeImage() else { exit(1) }
let rep = NSBitmapImageRep(cgImage: out)
rep.size = NSSize(width: w, height: h)
guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: salida)

print("\(w)x\(h)  opacos=\(opacos)  (\(opacos * 100 / (w * h))% de la imagen)")
