import { h, icon } from "../../core/dom.js";
import { DL } from "../../core/exportState.js";

// // { title, ctxLabel, date, updated, kpi:{gross,sold,shows} }

export const dlSlug = (str) =>
  String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// dom-to-image-more, not html2canvas: html2canvas walks the DOM and blocks on
// every asset, and on iOS it never resolves ("rendering timed out"). This
// library serialises into an SVG <foreignObject>, inlines fonts/images itself,
// and returns a PNG data URL. (Same renderer tracktollywood uses.)
export const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let libLoad = null;
export function ensureLib() {
  if (window.domtoimage) return Promise.resolve();
  if (libLoad) return libLoad;
  libLoad = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src =
      "https://cdn.jsdelivr.net/npm/dom-to-image-more@3.10.0/dist/dom-to-image-more.min.js";
    sc.onload = () => res();
    sc.onerror = () => {
      libLoad = null;
      rej(new Error("renderer failed to load"));
    };
    document.head.appendChild(sc);
  });
  return libLoad;
}

// Wordmark under the data on the export card
export function watermarkFooter() {
  return h(
    "div",
    { class: "exp-wm" },
    h("span", null, "CINE", h("b", null, "BO"), "TRENDS"),
  );
}

// Now that the uicons face is served same-origin, dom-to-image can inline it,
// so the export uses the SAME icons as the live UI.
export function summaryChip(kind, val) {
  return h("span", { class: "exp-chip" }, icon(kind), h("b", null, val));
}

// dom-to-image fetches <img> src itself and swaps in the placeholder when that
// fails — which is why the logo came out blank. Inline it up-front instead.
// Every image in the card must be inlined as a data: URL — dom-to-image can't
// pull a cross-origin asset (BMS posters send no CORS headers for XHR), and a
// failed image silently becomes the transparent placeholder.
const IMG_CACHE = {};

const blobToDataUrl = (blob) =>
  new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res("");
    fr.readAsDataURL(blob);
  });

// Route 1: fetch + FileReader. Preferred, because it has no canvas to taint.
async function viaFetch(url) {
  try {
    // cache-bust ONLY for the cross-origin case: Safari will happily reuse the
    // no-CORS response the page already cached for the same URL, and then the
    // canvas/response is unusable. A distinct URL forces a fresh CORS request.
    const u = url + (url.indexOf("?") < 0 ? "?" : "&") + "cbt=1";
    const r = await fetch(u, { mode: "cors", cache: "reload" });
    if (!r.ok) return "";
    return await blobToDataUrl(await r.blob());
  } catch (e) {
    return "";
  }
}

// Route 2: <img> + canvas. Works same-origin; cross-origin only if the host
// sends CORS headers AND Safari didn't already poison the cache.
function viaCanvas(url, cors) {
  return new Promise((res) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = im.naturalWidth || 1;
        c.height = im.naturalHeight || 1;
        const ctx = c.getContext("2d");
        ctx.drawImage(im, 0, 0);
        const out = c.toDataURL("image/png");
        res(out && out.length > 2000 ? out : "");
      } catch (e) {
        res("");
      }
    };
    im.onerror = () => res("");
    im.src = cors ? url + (url.indexOf("?") < 0 ? "?" : "&") + "cbt=1" : url;
  });
}

async function imgToDataUrl(url, cors) {
  if (!url) return "";
  if (IMG_CACHE[url] !== undefined) return IMG_CACHE[url];
  let out = "";
  if (cors) out = await viaFetch(url); // iOS-safe path first
  if (!out) out = await viaCanvas(url, cors);
  IMG_CACHE[url] = out;
  return out;
}

// A poster mirrored into assets/posters/ is same-origin: no CORS request, no
// cache taint, no canvas restrictions. Only a still-hotlinked URL needs the
// cross-origin path.
const isRemote = (u) => /^https?:/i.test(u || "");

export async function exportAssets() {
  const pos = (DL.meta && DL.meta.poster) || {};
  const [logo, poster, bg] = await Promise.all([
    imgToDataUrl("/assets/logo-mark.png", false),
    imgToDataUrl(pos.thumb, isRemote(pos.thumb)),
    imgToDataUrl(pos.bg, isRemote(pos.bg)),
  ]);
  return { logo, poster, bg };
}
