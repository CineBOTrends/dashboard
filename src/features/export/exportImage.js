import { TRANSPARENT_PX, ensureLib, exportAssets } from "./assets.js";
import { buildExportCard } from "./card.js";
import { anchorDownload, decodeAll, errSheet, iosSheet, isIOS, progressSheet, withTimeout } from "./sheets.js";

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

    await withTimeout(ensureLib(), 10000, "loading the renderer");

    const bg = (
      getComputedStyle(document.body).getPropertyValue("--bg") || "#0E0C09"
    ).trim();
    const w = card.offsetWidth || 1180;
    const hgt = card.offsetHeight || 800;

    // iOS caps canvas memory hard: degrade resolution rather than fail
    const cap = isIOS() ? 12e6 : 3e7;
    let scale = isIOS() ? 1.5 : 2;
    if (w * hgt * scale * scale > cap)
      scale = Math.max(1, Math.sqrt(cap / (w * hgt)));

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

    const dataUrl = await withTimeout(
      window.domtoimage.toPng(card, opts),
      25000,
      "rendering",
    );
    if (!dataUrl || dataUrl.length < 2000)
      throw new Error("renderer returned an empty image");

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
    const res = await withTimeout(
      fetch(url, { cache: "force-cache" }),
      30000,
      "downloading",
    );
    if (!res.ok)
      throw new Error("report image not found (HTTP " + res.status + ")");
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
