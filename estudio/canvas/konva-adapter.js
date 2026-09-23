// estudio/canvas/konva-adapter.js
//
// ÚNICO archivo del repo que toca Konva. Si aparece `Konva` en cualquier otro
// sitio, el aislamiento se rompió.
//
// ── La topología no es cosmética ──
//
// Cada Konva.Layer es un <canvas> distinto, apilado por CSS. Una
// globalCompositeOperation se aplica dentro del canvas de SU propia layer y no
// cruza esa frontera, ni en pantalla ni al exportar. Por eso:
//
//   Layer "compose"  ← TODO lo que se mezcla vive aquí, en una sola layer
//     · Image garment    (canvas ya teñido por garment-painter, offscreen)
//     · Group clip=printArea → Image logo   (arrastrable)
//     · Group clip=printArea → Image foldMap (multiply, opacidad baja)
//     · Rect printAreaGuide (guía punteada, no escucha eventos)
//
//   Layer "ui"       ← FUERA del snapshot
//     · Transformer (los tiradores de escala y rotación)
//
// El snapshot sale de composeLayer, NO de stage.toDataURL(): así los tiradores
// del Transformer nunca entran a la imagen que aprueba el cliente.
//
// ── Los recortes ──
//
// El logo y el fold map van cada uno en un Group con clip = printArea. El del
// logo impide que se salga del área imprimible aunque el clamp fallara. El del
// fold map es igual de importante por otro motivo: multiplicar la sombra sobre
// TODA la prenda la oscurecería entera, cuando lo único que se busca es que el
// logo herede los pliegues de la zona donde va impreso.

import {
  clampTransformToArea,
  transformToRenderProps,
  fitTransformToArea,
  maxFitScaleFor,
} from '../lib/geometry.js';
import { paintGarment, paintFoldMap } from './garment-painter.js';
import { assertNotTainted } from './image-loader.js';
import { AppError } from '../lib/errors.js';
import { isDarkColor } from '../lib/color.js';

const DEFAULT_FOLD_OPACITY = 0.35;
// El fit automático al subir un logo deja este margen bajo el techo real
// (ver maxFitScaleFor): a 1.0 el logo nace exactamente pegado al límite que
// clampScale nunca deja superar, y agrandar/mover/rotar desde ahí es un no-op
// o un achicamiento sorpresa — el cliente hace click y "no pasa nada". No
// aplica a fitLogo() (botón "Ajustar al área"): ese sí debe maximizar de
// verdad cuando el cliente lo pide explícitamente.
const INITIAL_FIT_HEADROOM = 0.9;

/**
 * @param {{container: HTMLElement, width: number, height: number,
 *          printArea: {x:number,y:number,width:number,height:number}}} opts
 */
export function createStudioStage(opts) {
  const { container, width, height, printArea } = opts;
  if (typeof window.Konva === 'undefined') {
    throw new AppError('KONVA_NOT_LOADED', 'Konva no está cargado.', {});
  }
  const Konva = window.Konva;

  // Konva ya multiplica el backing-store de cada canvas por
  // window.devicePixelRatio (confirmado leyendo konva.min.js@10.3.3): no hace
  // falta "activar" retina. El problema real es que canvas_size (width/height,
  // arriba) se eligió sólo por el costo de paintGarment/paintFoldMap (~0.86MP,
  // ver CLAUDE.md) y ese mismo número termina siendo el techo de resolución de
  // TODO lo que se ve en pantalla. Forzar aquí un pixelRatio por encima del que
  // Konva pondría por defecto (mínimo 2, incluso en pantallas no-retina) le da
  // más resolución de backing-store al compositor sin tocar canvas_size ni el
  // sistema de coordenadas (printArea, clamp, Transformer, snapshot siguen en
  // unidades lógicas) — y sin recalcular el teñido: paintGarment/paintFoldMap
  // dibujan en su propio canvas offscreen a canvas_size, ajeno a este valor.
  //
  // OJO: un `pixelRatio` en el config de `new Konva.Stage(...)`/`new
  // Konva.Layer(...)` NO hace nada en Konva 10.3.3 — verificado en navegador
  // (el backing-store seguía en 900 a dpr=1 pasándolo ahí). Cada Layer crea su
  // SceneCanvas leyendo la propiedad GLOBAL `Konva.pixelRatio`, así que hay
  // que fijarla ahí antes de crear las layers. Este archivo es el ÚNICO que
  // toca Konva (ver cabecera) y sólo existe UN stage a la vez (el anterior se
  // `destroy()`-ea antes de crear el siguiente, ver studio-app.js), así que
  // pisar el global aquí es seguro y no se filtra a nada más.
  window.Konva.pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
  const stage = new Konva.Stage({ container, width, height });

  // Una sola layer para todo lo que mezcla. Ver la nota de arriba.
  const composeLayer = new Konva.Layer({ name: 'compose' });
  const uiLayer = new Konva.Layer({ name: 'ui' });
  stage.add(composeLayer);
  stage.add(uiLayer);

  const garmentNode = new Konva.Image({ x: 0, y: 0, width, height, listening: false });

  const clipOf = () => ({
    clipX: printArea.x,
    clipY: printArea.y,
    clipWidth: printArea.width,
    clipHeight: printArea.height,
  });

  const logoGroup = new Konva.Group(clipOf());
  const logoNode = new Konva.Image({ draggable: true, visible: false });
  logoGroup.add(logoNode);

  const foldGroup = new Konva.Group({ ...clipOf(), listening: false });
  const foldNode = new Konva.Image({
    x: 0, y: 0, width, height,
    globalCompositeOperation: 'multiply',
    opacity: DEFAULT_FOLD_OPACITY,
    listening: false,
    visible: false,
  });
  foldGroup.add(foldNode);

  // La guía se pinta SOBRE la prenda, así que su color tiene que depender del
  // color de la prenda. Con un trazo fijo casi blanco, sobre una playera blanca
  // o amarilla desaparecía por completo y el cliente dejaba de ver dónde puede
  // colocar su logo. No se notaba con el mockup procedural (gris medio, donde
  // un trazo claro siempre contrastaba); saltó al poner la foto real, que es de
  // una playera blanca. isDarkColor ya existe y está probada en color.test.js.
  const trazoGuia = (hex) => (isDarkColor(hex) ? 'rgba(240,240,238,0.45)' : 'rgba(12,12,12,0.45)');

  const printAreaGuide = new Konva.Rect({
    ...printArea,
    stroke: trazoGuia('#0C0C0C'), // provisional: setGarment lo fija al color real
    strokeWidth: 1,
    dash: [6, 4],
    listening: false,
  });

  // El orden importa: prenda → logo → sombra de pliegues → guía.
  // La sombra va DESPUÉS del logo porque lo que debe oscurecer es el logo, no
  // la prenda (que ya trae sus propios pliegues de la foto base).
  composeLayer.add(garmentNode);
  composeLayer.add(logoGroup);
  composeLayer.add(foldGroup);
  composeLayer.add(printAreaGuide);

  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: true,
    // Imanta el gesto de rotar en el canvas a los ángulos "derechos": mismo
    // criterio que snapRotation() en geometry.js, que hace lo propio para el
    // slider — ver setLogo()/RangeField de Rotación en panel-logo.js.
    rotationSnaps: [0, 90, 180, 270],
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    borderStroke: '#D02B34',
    anchorStroke: '#D02B34',
    anchorFill: '#F0F0EE',
    anchorSize: 10,
    visible: false,
  });
  uiLayer.add(transformer);

  let naturalSize = null;
  let current = { x: printArea.x + printArea.width / 2, y: printArea.y + printArea.height / 2, scaleX: 1, scaleY: 1, rotation: 0 };
  // Techo de escala alcanzable AHORA MISMO (a la rotación actual del logo) —
  // lo recalcula commit() en cada cambio, no sólo al subir/ajustar el logo.
  // panel-logo.js lo usa como referencia para mostrar el % de Escala RELATIVO
  // al fit ("100%" = el máximo real), en vez del ratio absoluto
  // canvas/archivo que no dice nada al cliente — ver getFitScale().
  let lastFitScale = 1;
  let baseImage = null;
  let lastColorHex = null;
  // hasLogo es un espejo de logoNode.visible(): setView necesita saber si HAY
  // logo para decidir si mostrarlo, sin depender de leer el estado de Konva
  // (que setView mismo puede estar a punto de pisar).
  let hasLogo = false;
  let guideRequested = true;
  // Sólo "front" es imprimible (spec: left/right/back son vistas de
  // presentación, sin print_area ni logo propios). Empieza en true porque el
  // stage siempre se crea mostrando la vista front.
  let printable = true;
  const listeners = new Set();

  /**
   * ÚNICO punto donde cambia el transform. No hay otro, y es deliberado: los
   * handlers de Konva no deciden nada, sólo reportan; la decisión la toma
   * geometry.clampTransformToArea, que está probado con 17 280 combinaciones.
   */
  function commit(raw) {
    if (!naturalSize) return;
    const clamped = clampTransformToArea(raw, naturalSize, printArea);
    const props = transformToRenderProps(clamped, naturalSize);

    logoNode.setAttrs(props);
    // La escala vive en width/height, no en scaleX/scaleY del nodo: si se
    // dejara en el nodo, el Transformer la acumularía en cada gesto y el
    // transform que reportamos dejaría de coincidir con lo que se ve.
    logoNode.scaleX(1);
    logoNode.scaleY(1);

    current = clamped;
    // Recalculado en CADA commit, no sólo al subir/ajustar el logo: la
    // rotación cambia el techo (una caja rotada necesita más espacio), así
    // que el % de Escala que ve el cliente debe reflejar siempre el máximo
    // vigente, no el que había cuando se subió el logo.
    lastFitScale = maxFitScaleFor(clamped, naturalSize, printArea);
    composeLayer.batchDraw();
    uiLayer.batchDraw();
    listeners.forEach((fn) => fn({ ...clamped }));
  }

  function readFromNode() {
    return {
      x: logoNode.x(),
      y: logoNode.y(),
      // El Transformer sí manipula scaleX/scaleY durante el gesto; se traduce
      // de vuelta a la escala respecto del tamaño natural.
      scaleX: (logoNode.width() * logoNode.scaleX()) / naturalSize.width,
      scaleY: (logoNode.height() * logoNode.scaleY()) / naturalSize.height,
      rotation: logoNode.rotation(),
    };
  }

  for (const ev of ['dragmove', 'dragend', 'transform', 'transformend']) {
    logoNode.on(ev, () => commit(readFromNode()));
  }

  const api = {
    /** Prenda base + color. `foldImage` null = sin sombra de pliegues. */
    setGarment({ baseImage: img, foldImage, colorHex }) {
      if (img) baseImage = img;
      if (!baseImage) throw new AppError('NO_BASE_IMAGE', 'Falta la imagen base de la prenda.', {});
      if (colorHex) lastColorHex = colorHex;

      garmentNode.image(paintGarment(baseImage, lastColorHex, { width, height }));
      printAreaGuide.stroke(trazoGuia(lastColorHex));

      const foldSource = foldImage ?? baseImage;
      if (foldSource) {
        foldNode.image(paintFoldMap(foldSource, { width, height }));
        foldNode.visible(true);
      } else {
        foldNode.visible(false);
      }
      composeLayer.batchDraw();
    },

    setLogo({ image, naturalSize: ns }) {
      if (!image) {
        hasLogo = false;
        logoNode.visible(false);
        transformer.nodes([]);
        transformer.visible(false);
        naturalSize = null;
        composeLayer.batchDraw();
        uiLayer.batchDraw();
        return;
      }
      hasLogo = true;
      naturalSize = ns;
      logoNode.image(image);
      // La vista activa decide si el logo se ve: si se sube/reajusta un logo
      // estando en una vista de presentación (left/right/back), el nodo queda
      // listo pero oculto — sólo "front" lo muestra. Ver setView().
      logoNode.visible(printable);
      logoGroup.visible(printable);
      foldGroup.visible(printable);
      transformer.nodes(printable ? [logoNode] : []);
      transformer.visible(printable);
      // Headroom a propósito (ver INITIAL_FIT_HEADROOM): commit() ya
      // recalcula lastFitScale solo, así que aquí no hace falta tocarlo — y
      // no debe fijarse al valor SIN headroom de `fit`, o el % de Escala
      // mostraría "100%" para un logo que en realidad nació al 90%.
      const fit = fitTransformToArea(ns, printArea, 'contain');
      commit({ ...fit, scaleX: fit.scaleX * INITIAL_FIT_HEADROOM, scaleY: fit.scaleY * INITIAL_FIT_HEADROOM });
    },

    getTransform() {
      return { ...current };
    },

    /** Ver la nota de lastFitScale más arriba. */
    getFitScale() {
      return lastFitScale;
    },

    setTransform(t) {
      commit(t);
    },

    fitLogo(mode = 'contain') {
      if (!naturalSize) return;
      // Sin headroom: a diferencia del fit automático de setLogo(), este es
      // el botón explícito "Ajustar al área" — su trabajo es maximizar.
      commit(fitTransformToArea(naturalSize, printArea, mode));
    },

    onTransformChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    setPrintAreaVisible(visible) {
      guideRequested = visible;
      printAreaGuide.visible(printable && visible);
      composeLayer.batchDraw();
    },

    /**
     * Cambia qué imagen de prenda se ve, SIN tocar el logo ni el print_area:
     * ambos siguen siendo los del front, porque sólo el front es imprimible
     * (spec: left/right/back son vistas de presentación). Como
     * garment_type_views.canvas_size se calibra igual al canvas_size del
     * front de esa prenda, el Stage nunca cambia de tamaño aquí — sólo se
     * reemplaza la imagen de la prenda y se muestra/oculta lo que sólo
     * aplica al front, sin destruir naturalSize/current (el transform del
     * logo se conserva intacto para cuando se vuelva a "front").
     */
    setView({ baseImage: viewImage, printable: nuevoPrintable }) {
      if (!viewImage) throw new AppError('NO_VIEW_IMAGE', 'Falta la imagen de esta vista.', {});
      api.setGarment({ baseImage: viewImage, foldImage: null, colorHex: null });
      printable = nuevoPrintable;

      logoNode.visible(printable && hasLogo);
      logoGroup.visible(printable && hasLogo);
      logoNode.draggable(printable);
      foldGroup.visible(printable && hasLogo);
      printAreaGuide.visible(printable && guideRequested);
      transformer.nodes(printable && hasLogo ? [logoNode] : []);
      transformer.visible(printable && hasLogo);

      composeLayer.batchDraw();
      uiLayer.batchDraw();
    },

    isPrintable() {
      return printable;
    },

    setFoldShadowOpacity(value) {
      foldNode.opacity(value);
      composeLayer.batchDraw();
    },

    /**
     * PNG de lo que el cliente aprobó. Sale de composeLayer, no del stage: los
     * tiradores del Transformer viven en uiLayer y quedan fuera por
     * construcción, sin tener que acordarse de ocultarlos antes de exportar.
     */
    async snapshot({ pixelRatio = 1, mimeType = 'image/png', quality } = {}) {
      assertNotTainted(composeLayer.getCanvas()._canvas);
      const canvas = composeLayer.toCanvas({ pixelRatio });
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob
            ? resolve(blob)
            : reject(new AppError('SNAPSHOT_FAILED', 'El canvas no pudo exportarse a PNG.', {}))),
          mimeType,
          quality,
        );
      });
    },

    /** Escotilla para los tests: leer píxeles del canvas compuesto. */
    sampleComposePixel(x, y) {
      const c = composeLayer.getCanvas()._canvas;
      const ctx = c.getContext('2d');
      const ratio = c.width / width;
      const d = ctx.getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    },

    /** Sólo para los tests: comprobar la topología de layers. */
    debugInfo() {
      return {
        layers: stage.getLayers().map((l) => l.name()),
        composeChildren: composeLayer.getChildren().length,
        uiChildren: uiLayer.getChildren().length,
        stageWidth: stage.width(),
        stageHeight: stage.height(),
        printArea: { ...printArea },
        // Lo expone para que un test pueda comprobar que la guía se adapta al
        // color de la prenda. Muestrear el píxel del trazo sería frágil: es una
        // línea punteada de 1 px.
        printAreaGuideStroke: printAreaGuide.stroke(),
        // true = vista "front" activa (única imprimible). false = vista de
        // presentación (left/right/back): sin logo, sin guía, sin Transformer.
        printable,
      };
    },

    destroy() {
      listeners.clear();
      stage.destroy();
    },
  };

  return api;
}
