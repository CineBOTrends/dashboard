import { TRANSPARENT_PX, ensureLib, exportAssets } from "./assets.js";
import { buildExportCard } from "./card.js";
import {
  anchorDownload,
  decodeAll,
  errSheet,
  iosSheet,
  isIOS,
  progressSheet,
  withTimeout,
} from "./sheets.js";

export async function downloadSection(section, sectionTitle, name, btn) {
  const label = btn.querySelector(".dl-label");
  const was = label ? label.textContent : "";
  const ios = isIOS();
  const touch = ios || window.matchMedia("(max-width: 760px)").matches;
  const prog = touch ? progressSheet() : null;

  btn.disabled = true;
  if (label) label.textContent = "Saving…";

  // EVERYTHING goes inside the try. Building the card outside it meant a throw
  // there skipped the catch entirely: the sheet just sat on "Preparing image…"
  // forever with the rejection swallowed.
  let card = null;
  // hard watchdog: no matter what happens below, the sheet never hangs
  const watchdog = setTimeout(() => {
    if (prog) prog.fail("timed out with no response from the renderer");
  }, 35000);

  try {
    const A = await withTimeout(exportAssets(), 9000, "loading images");
    card = buildExportCard(section, sectionTitle, A);
    document.body.appendChild(card);

    // must happen AFTER the card is in the DOM, before we rasterise
    await withTimeout(decodeAll(card), 8000, "decoding images");

    await bakeStub(card);
    // let the browser actually paint the decoded images before serialising
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    await withTimeout(ensureLib(), 10000, "loading the renderer");

    const bg = (getComputedStyle(document.body).getPropertyValue("--bg") || "#0E0C09").trim();
    const w = card.offsetWidth || 1180;
    const hgt = card.offsetHeight || 800;

    // iOS caps canvas memory hard: degrade resolution rather than fail
    const cap = isIOS() ? 12e6 : 3e7;
    // INTEGER scales only. WebKit renders a big foreignObject in tiles, and at
    // a fractional scale (the old 1.5 on iPhone) the tile edges land between
    // device pixels and show up as a thin vertical seam running down the card.
    let scale = 2;
    if (w * hgt * scale * scale > cap) scale = Math.max(1, Math.floor(Math.sqrt(cap / (w * hgt))));

    const opts = {
      bgcolor: bg,
      width: Math.ceil(w * scale),
      height: Math.ceil(hgt * scale),
      style: {
        transform: "scale(" + scale + ")",
        transformOrigin: "top left",
      },
      // NO cacheBust: it appends ?t=… to every URL, which corrupts the
      // data: URI watermark tile. And a failed image THROWS unless a
      // placeholder is supplied — a cross-origin icon font must not kill
      // the whole render.
      imagePlaceholder: TRANSPARENT_PX,
    };

    // dom-to-image drops embedded images on the first toPng() of a node — the
    // <img>/background data URIs aren't in its internal cache yet, so they
    // rasterise empty. Warm its cache before rendering the real export.
    //
    // The warm-up is rendered TINY. It only has to populate the cache, and a
    // full-size throwaway doubles peak memory — which on an iPhone is the one
    // resource we cannot spend.
    const WARM = 0.12;
    for (let pass = 0; pass < (ios ? 2 : 1); pass += 1)
      await withTimeout(
        window.domtoimage.toPng(card, {
          ...opts,
          width: Math.max(1, Math.ceil(w * WARM)),
          height: Math.max(1, Math.ceil(hgt * WARM)),
          style: {
            transform: "scale(" + WARM + ")",
            transformOrigin: "top left",
          },
        }),
        20000,
        "preparing images",
      );

    // On a cold page Safari/iOS can still rasterise the poster/backdrop empty
    // on the first full render (it only worked on the second tap, because that
    // render had warmed the image cache). Check the poster region of the
    // result and re-render automatically instead of making the user tap twice.
    let dataUrl = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      dataUrl = await withTimeout(window.domtoimage.toPng(card, opts), 25000, "rendering");
      if (!dataUrl || dataUrl.length < 2000) break;
      if (await posterPainted(card, dataUrl, scale)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!dataUrl || dataUrl.length < 2000) throw new Error("renderer returned an empty image");

    if (ios) {
      if (prog) prog.done();
      iosSheet(dataUrl, name);
    } else if (prog) {
      anchorDownload(dataUrl, name);
      prog.done();
    } else {
      anchorDownload(dataUrl, name);
    }
    if (label) label.textContent = was;
  } catch (e) {
    console.error(e);
    const msg = (e && e.message) || String(e);
    if (prog) prog.fail(msg);
    else errSheet(msg);
    if (label) label.textContent = "Failed";
    setTimeout(() => {
      if (label) label.textContent = was;
    }, 2200);
  } finally {
    clearTimeout(watchdog);
    if (card) card.remove();
    btn.disabled = false;
  }
}

// Download an image that already exists on the server (no re-rendering).
// Same platform handling as downloadSection(): real download on desktop /
// Android, share-sheet on iOS.
export async function downloadImageFile(url, name, btn) {
  const label = btn.querySelector(".dl-label");
  const was = label ? label.textContent : "";
  btn.disabled = true;
  if (label) label.textContent = "Saving…";
  try {
    const res = await withTimeout(fetch(url, { cache: "force-cache" }), 30000, "downloading");
    if (!res.ok) throw new Error("report image not found (HTTP " + res.status + ")");
    const blob = await res.blob();
    if (!blob.size || !/^image\//.test(blob.type || "image/png"))
      throw new Error("report image is empty");
    if (isIOS()) {
      const dataUrl = await new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = () => no(new Error("couldn't read the image"));
        r.readAsDataURL(blob);
      });
      iosSheet(dataUrl, name);
    } else {
      const obj = URL.createObjectURL(blob);
      anchorDownload(obj, name);
      setTimeout(() => URL.revokeObjectURL(obj), 10000);
    }
    if (label) label.textContent = was;
  } catch (e) {
    console.error(e);
    errSheet((e && e.message) || String(e));
    if (label) label.textContent = "Failed";
    setTimeout(() => {
      if (label) label.textContent = was;
    }, 2200);
  } finally {
    btn.disabled = false;
  }
}

// Paint the ticket-stub look (poster, dashed perforation, two notches) into ONE
// image. Doing it with extra DOM elements / pseudo-elements is what made iOS
// draw a dashed line down the whole card: with a single <img> there is nothing
// left to mis-position. The image is PAD px wider than the stub and shifted
// left by PAD, so the notch circles can bite into the hero beside it.
async function bakeStub(card) {
  try {
    const stub = card.querySelector(".exp-hero-r");
    const img = stub && stub.querySelector("img");
    if (!img) return;
    const w = stub.offsetWidth;
    const h = stub.offsetHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!w || !h || !iw || !ih) return;
    const PERF = false; // compact header: no cut strip / notches
    const PAD = PERF ? 22 : 0;
    const S = 2;
    const bgc = (getComputedStyle(document.body).getPropertyValue("--bg") || "#0E0C09").trim();
    const c = document.createElement("canvas");
    c.width = (w + PAD) * S;
    c.height = h * S;
    const ctx = c.getContext("2d");
    ctx.scale(S, S);
    // poster card: 3:4, inset from the stub edges, rounded, with a soft shadow.
    // The rest of the stub stays transparent so the backdrop shows through.
    // FIXED-size 3:4 card, vertically centred: the hero can be any height and
    // the poster stays the same size (it used to stretch with the hero).
    const CARD_W = 270; // bigger poster: fills most of the 300px stub (3:4)
    const CARD_H = 340;
    const pw = Math.min(CARD_W, w - 24);
    const ph = Math.min(Math.round((pw * CARD_H) / CARD_W), h - 24);
    const px = PAD + Math.round((w - pw) / 2) + (PERF ? 4 : 0);
    const py = Math.round((h - ph) / 2);
    const rr = (x, y, ww, hh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    };
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    rr(px, py, pw, ph, 14);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(px, py, pw, ph, 14);
    ctx.clip();
    const k = Math.max(pw / iw, ph / ih); // object-fit: cover
    const dw = iw * k;
    const dh = ih * k;
    ctx.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    ctx.restore();
    rr(px + 0.5, py + 0.5, pw - 1, ph - 1, 14);
    ctx.strokeStyle = "rgba(255,176,0,.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (PERF) {
      // perforation
      ctx.strokeStyle = "rgba(233,176,45,.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(PAD + 1, 0);
      ctx.lineTo(PAD + 1, h);
      ctx.stroke();
      // notches
      ctx.setLineDash([]);
      ctx.fillStyle = bgc;
      [0, h].forEach((y) => {
        ctx.beginPath();
        ctx.arc(PAD - 1, y, 20, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    img.src = c.toDataURL("image/png");
    img.style.cssText =
      "position:relative;left:-" +
      PAD +
      "px;width:" +
      (w + PAD) +
      "px;" +
      "height:" +
      h +
      "px;max-width:none;object-fit:fill;display:block";
    await (img.decode ? img.decode().catch(() => {}) : Promise.resolve());
  } catch (err) {
    console.warn("stub bake skipped", err);
  }
}

// True when the poster area of the rendered PNG actually contains the poster
// (i.e. is not a flat fill). Returns true when there is no poster to check, or
// when the check itself can't run, so it can never block a download.
async function posterPainted(card, dataUrl, scale) {
  try {
    const img = card.querySelector(".exp-hero-r img");
    if (!img) return true;
    const fr = card.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    const im = new Image();
    im.src = dataUrl;
    await im.decode();
    const N = 24;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    // sample the middle of the poster, clear of the perforation and notches
    const sx = (r.left - fr.left + r.width * 0.2) * scale;
    const sy = (r.top - fr.top + r.height * 0.2) * scale;
    ctx.drawImage(im, sx, sy, r.width * 0.6 * scale, r.height * 0.6 * scale, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      sum += l;
      sum2 += l * l;
    }
    const n = d.length / 4;
    const sd = Math.sqrt(Math.max(0, sum2 / n - (sum / n) * (sum / n)));
    return sd > 6;
  } catch (e) {
    return true;
  }
}
