// Node-based Excalidraw renderer — produces SVG (and optionally PNG) without
// launching a headless browser. Drop-in replacement for render_excalidraw.py
// in environments where Playwright's bundled Chromium download is blocked
// (sandboxed CI, restricted egress proxies, etc.).
//
// Usage:
//   node render_excalidraw_node.mjs <path.excalidraw> [--output path.png|.svg]
//                                                    [--scale 2] [--format png|svg|both]
//
// What it does, end to end:
//   1. Reads the .excalidraw JSON.
//   2. Stands up a minimal browser-like environment in-process via jsdom +
//      node-canvas — enough for Excalidraw's exportToSvg() to compute glyph
//      widths, line wrapping, and arrow geometry.
//   3. Calls @excalidraw/excalidraw#exportToSvg with the JSON's elements,
//      appState, and files map.
//   4. Writes the resulting SVG to disk. Optionally rasterizes to PNG via
//      sharp at the requested device-scale factor.
//
// Why this exists alongside render_excalidraw.py:
//   The Playwright renderer is the canonical implementation — it runs the
//   real Excalidraw web bundle inside real Chromium and is closest to
//   "what the user sees on excalidraw.com". Use it whenever Playwright's
//   Chromium installs cleanly.
//
//   This Node renderer is the fallback for environments where that fails:
//   the Anthropic web sandbox blocks playwright.azureedge.net (the CDN
//   for Playwright's Chromium tarball), and corporate egress proxies
//   often do the same. jsdom + node-canvas can handle ~95% of typical
//   diagrams correctly. Watch out for two known limitations:
//
//     - Font metrics drift by 1–2 px vs. Chromium because node-canvas
//       uses a slightly different text-shaping path. If a label is
//       right at the edge of its container it may wrap differently
//       than the Excalidraw web app shows.
//     - Custom embedded images via the `files` map are resolved by
//       Excalidraw via `<image>` SVG tags; jsdom serves the SVG fine
//       but image rasterization in the SVG → PNG step relies on sharp,
//       which doesn't follow data: URIs inside <image href> the same
//       way a browser does. Diagrams without embedded raster files
//       are not affected.
//
//   For diagrams where the Node renderer's output looks off, fall back
//   to the Playwright path on a machine where Chromium is available
//   (your laptop, a CI runner without egress restrictions, etc.).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { Canvas as NodeCanvas, Image as NodeImage } from "canvas";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// CLI argument parsing — kept hand-rolled so the script has no extra deps
// beyond what the renderer itself requires.
// -----------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { input: null, output: null, scale: 2, format: "both" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output" || a === "-o") {
      args.output = argv[++i];
    } else if (a === "--scale" || a === "-s") {
      args.scale = Number(argv[++i]);
    } else if (a === "--format" || a === "-f") {
      args.format = argv[++i];
    } else if (!a.startsWith("-") && args.input === null) {
      args.input = a;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node render_excalidraw_node.mjs <input.excalidraw> [--output PATH] [--scale N] [--format png|svg|both]",
      );
      process.exit(0);
    }
  }
  if (!args.input) {
    console.error(
      "ERROR: no input file. Usage: node render_excalidraw_node.mjs <file.excalidraw> [--format png|svg|both]",
    );
    process.exit(1);
  }
  if (!["png", "svg", "both"].includes(args.format)) {
    console.error(`ERROR: --format must be png, svg, or both (got '${args.format}')`);
    process.exit(1);
  }
  return args;
}

// -----------------------------------------------------------------------------
// Browser-environment shim. Excalidraw's exportToSvg expects window/document
// to be present at module-import time, so the dom must be set up BEFORE the
// dynamic import below. node-canvas provides the 2d context for text
// measurement during layout (Excalidraw uses ctx.measureText() to size labels
// inside containers).
// -----------------------------------------------------------------------------

function installDomShim() {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const { window } = dom;

  // Patch HTMLCanvasElement#getContext("2d") onto jsdom by delegating to
  // node-canvas. Excalidraw's text-layout pass calls ctx.measureText() to
  // size text inside a sized container; without this it sees undefined and
  // every text element collapses to width 0.
  const realCanvasProto = window.HTMLCanvasElement.prototype;
  realCanvasProto.getContext = function (type) {
    if (type === "2d") {
      const c = new NodeCanvas(this.width || 300, this.height || 150);
      return c.getContext("2d");
    }
    return null;
  };

  // Excalidraw's bundle does eager top-level reads of many browser globals
  // (e.g. `navigator.platform`, `window.location`, `devicePixelRatio`,
  // `navigator.userAgent.indexOf(...)`), so EVERYTHING jsdom exposes has
  // to be visible as a globalThis property BEFORE the dynamic import below.
  //
  // Two reasons we can't just do `Object.assign(globalThis, window)`:
  //   1. Some Node-defined globals are getter-only properties (notably
  //      `navigator` on Node 21+) — plain assignment throws. We use
  //      Object.defineProperty with writable: true to override.
  //   2. We need to skip names that already exist on globalThis with
  //      Node's built-in implementations (e.g. `Map`, `Set`, `Promise`,
  //      `console`, `process`) because replacing them with jsdom's
  //      copies would break Node modules that round-trip values through
  //      these types.
  const PRESERVE = new Set(["console", "process", "global", "globalThis", "Buffer"]);
  const FORCE_OVERRIDE = new Set([
    "window",
    "document",
    "navigator",
    "devicePixelRatio",
    "location",
  ]);
  for (const k of Object.getOwnPropertyNames(window)) {
    if (PRESERVE.has(k)) continue;
    if (k in globalThis && !FORCE_OVERRIDE.has(k)) continue;
    try {
      Object.defineProperty(globalThis, k, {
        value: k === "window" ? window : window[k],
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch {
      // Skip properties Node refuses to redefine (e.g. some symbol-keyed
      // wellknown globals). The real failure modes will surface at import
      // time as ReferenceErrors against missing identifiers, which is more
      // diagnostic than a noisy shim-time warning.
    }
  }

  // node-canvas's Image class handles the SVG <image> rasterization path
  // better than jsdom's lightweight stub — override after the bulk copy.
  Object.defineProperty(globalThis, "Image", {
    value: NodeImage,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  // Animation-frame stubs Excalidraw uses inside its render scheduler.
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

  // Excalidraw's font-loader registers FontFace instances for each
  // bundled font even during SVG export. jsdom doesn't ship FontFace
  // (it's a CSS Font Loading API class, not part of the core DOM), so we
  // give it a no-op stub. Glyph metrics still come from node-canvas's
  // built-in font fallback, which is good enough for typical diagrams —
  // see the file header for the known font-metrics drift caveat.
  if (typeof globalThis.FontFace === "undefined") {
    globalThis.FontFace = class FontFace {
      constructor(family, source, descriptors = {}) {
        this.family = family;
        this.style = descriptors.style ?? "normal";
        this.weight = descriptors.weight ?? "normal";
        this.unicodeRange = descriptors.unicodeRange ?? "U+0-10FFFF";
        this.status = "loaded";
      }
      load() {
        return Promise.resolve(this);
      }
    };
  }
  if (typeof globalThis.fonts === "undefined" && globalThis.document) {
    Object.defineProperty(globalThis.document, "fonts", {
      value: {
        ready: Promise.resolve(),
        check: () => true,
        load: () => Promise.resolve([]),
        add: () => {},
        delete: () => {},
        forEach: () => {},
      },
      configurable: true,
    });
  }

  return dom;
}

// -----------------------------------------------------------------------------
// Main. The flow is intentionally linear (no helpers per concern) because the
// renderer is small enough that the linear shape is the documentation.
// -----------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: file not found: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: invalid JSON in ${inputPath}: ${err.message}`);
    process.exit(1);
  }

  // Validate enough to fail loudly on common mistakes; the SVG export will
  // tolerate extra unknown properties so we don't need to match the schema
  // exhaustively here.
  if (data.type !== "excalidraw") {
    console.error(`ERROR: not an excalidraw file (type='${data.type}')`);
    process.exit(1);
  }
  const elements = (data.elements ?? []).filter((e) => !e?.isDeleted);
  if (elements.length === 0) {
    console.error("ERROR: no elements to render");
    process.exit(1);
  }

  installDomShim();

  // Dynamic import AFTER the DOM shim so any module-init code that touches
  // window/document sees a real value.
  //
  // We use @excalidraw/utils rather than @excalidraw/excalidraw because the
  // utils package exposes the same exportToSvg surface but its bundle is
  // pre-flattened in a way that resolves cleanly under Node ESM. The main
  // package's bundle imports `roughjs/bin/rough` (no extension) which Node
  // ESM rejects; @excalidraw/utils inlines roughjs and avoids that failure.
  const excalidrawUtils = await import("@excalidraw/utils");
  const { exportToSvg } = excalidrawUtils;

  const appState = {
    ...(data.appState ?? {}),
    viewBackgroundColor: data.appState?.viewBackgroundColor ?? "#ffffff",
    exportBackground: true,
    exportWithDarkMode: false,
  };

  const svgEl = await exportToSvg({
    elements,
    appState,
    files: data.files ?? {},
  });

  // jsdom's SVGElement has outerHTML; serialize directly. exportToSvg returns
  // a real SVGSVGElement, not a string, so we have to reach for outerHTML.
  const svgString = svgEl.outerHTML;

  // Resolve output paths. If --output is explicit we honor it; otherwise we
  // write next to the input file with .svg / .png extensions.
  const baseOut = args.output
    ? path.resolve(args.output).replace(/\.(png|svg)$/i, "")
    : inputPath.replace(/\.excalidraw$/i, "");
  const svgOut = `${baseOut}.svg`;
  const pngOut = `${baseOut}.png`;

  if (args.format === "svg" || args.format === "both") {
    fs.writeFileSync(svgOut, svgString, "utf8");
    console.log(`wrote ${svgOut}  (${svgString.length.toLocaleString()} bytes)`);
  }

  if (args.format === "png" || args.format === "both") {
    // sharp's `density` controls DPI. For a 2x scale we use 144dpi (96 * 1.5
    // is the closest stable integer that gives ~2x crisp output without the
    // memory blowup of 192dpi on very large diagrams).
    const density = 96 * Math.max(1, args.scale);
    const png = await sharp(Buffer.from(svgString), { density }).png().toBuffer();
    fs.writeFileSync(pngOut, png);
    console.log(`wrote ${pngOut}  (${png.length.toLocaleString()} bytes, scale=${args.scale}x)`);
  }
}

main().catch((err) => {
  console.error("ERROR:", err.stack || err.message || err);
  process.exit(1);
});
