import { h, icon } from "../../core/dom.js";

// Delivery differs by platform, and the differences are not cosmetic:
//  - desktop / Android : <a download> on a blob URL. A real download.
//  - iOS               : Safari won't offer "Save Image" on a blob: URL, and
//                        navigator.share() needs transient activation that our
//                        await chain has already spent. So we show the PNG as a
//                        data: URL (long-press saves it) plus a Save button that
//                        calls share() inside a fresh gesture.
export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function anchorDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Open the PNG as a normal page image in a new tab. Works in Chrome-iOS,
// where a top-level data:/blob: navigation is blocked but writing into an
// about:blank window we opened ourselves is not. Long-press there -> Save Image.
function openInTab(dataUrl, name) {
  const w = window.open("", "_blank");
  if (!w) return false;
  writeImageToTab(w, dataUrl, name);
  return true;
}

function writeImageToTab(w, dataUrl, name) {
  w.document.write(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>" +
      name +
      '</title><body style="margin:0;background:#0E0C09">' +
      '<img src="' +
      dataUrl +
      '" alt="' +
      name +
      '" style="width:100%;height:auto;display:block">',
  );
  w.document.close();
}

export function iosSheet(dataUrl, name) {
  const close = () => sheet.remove();

  const save = h(
    "button",
    {
      class: "dlm-btn primary",
      onclick: async (e) => {
        const b = e.currentTarget;
        try {
          // fresh tap => transient activation is valid, so share() is allowed
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], name, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: name });
            close();
            return;
          }
        } catch (err) {
          if (err && err.name === "AbortError") return;
        }
        // Chrome-iOS: no file share -> open it as a real image in a tab
        if (!openInTab(dataUrl, name))
          b.textContent = "Long-press the image above";
      },
    },
    icon("download"),
    " Save image",
  );

  const tab = h(
    "button",
    { class: "dlm-btn", onclick: () => openInTab(dataUrl, name) },
    "Open in new tab",
  );

  const sheet = h(
    "div",
    { class: "dlm", onclick: (e) => e.target === sheet && close() },
    h(
      "div",
      { class: "dlm-box" },
      h("img", { src: dataUrl, alt: name }),
      h(
        "p",
        { class: "dlm-hint" },
        "Long-press the image to save it — or use a button below.",
      ),
      h("div", { class: "dlm-row" }, save, tab),
      h(
        "div",
        { class: "dlm-row", style: "margin-top:8px" },
        h("button", { class: "dlm-btn", onclick: close }, "Close"),
      ),
    ),
  );
  document.body.appendChild(sheet);
}

// Opens synchronously on tap. Proves the handler fired, and gives a hang
// somewhere to show itself instead of looking like a dead button (on mobile
// the button's text label is hidden, so it can't report state on its own).
export function progressSheet() {
  const msg = h("p", { class: "dlm-hint" }, "Preparing image…");
  const box = h("div", { class: "dlm-box" }, msg);
  const sheet = h("div", { class: "dlm" }, box);
  document.body.appendChild(sheet);
  return {
    sheet,
    // download fired; give the user an out if iOS swallowed it
    saved(openPreview) {
      msg.textContent = "Saved. If nothing downloaded, save it manually:";
      box.appendChild(
        h(
          "div",
          { class: "dlm-row", style: "margin-top:12px" },
          h(
            "button",
            {
              class: "dlm-btn primary",
              onclick: () => {
                sheet.remove();
                openPreview();
              },
            },
            "Show image",
          ),
          h(
            "button",
            { class: "dlm-btn", onclick: () => sheet.remove() },
            "Done",
          ),
        ),
      );
    },
    fail(text) {
      msg.textContent = "Couldn't build the image: " + text;
      box.appendChild(
        h(
          "div",
          { class: "dlm-row", style: "margin-top:12px" },
          h(
            "button",
            { class: "dlm-btn primary", onclick: () => sheet.remove() },
            "Close",
          ),
        ),
      );
    },
    done: () => sheet.remove(),
  };
}

export function errSheet(msg) {
  const sheet = h(
    "div",
    { class: "dlm", onclick: (e) => e.target === sheet && sheet.remove() },
    h(
      "div",
      { class: "dlm-box" },
      h("p", { class: "dlm-hint" }, "Couldn't build the image: " + msg),
      h(
        "div",
        { class: "dlm-row" },
        h(
          "button",
          { class: "dlm-btn primary", onclick: () => sheet.remove() },
          "Close",
        ),
      ),
    ),
  );
  document.body.appendChild(sheet);
}

export const withTimeout = (p, ms, what) =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(what + " timed out")), ms),
    ),
  ]);

// dom-to-image serialises the node into an SVG immediately. Any <img> that
// has not DECODED yet rasterises as nothing — which is why the first download
// after a fresh page load came out with an empty poster, and the second (with
// the image already decoded in memory) was fine. Wait for decode explicitly.
export function decodeAll(root) {
  const jobs = [];

  [...root.querySelectorAll("img")].forEach((im) => {
    if (!im.src) return;
    jobs.push(
      im.decode
        ? im.decode().catch(() => {})
        : new Promise((r) => {
            if (im.complete) return r();
            im.onload = im.onerror = r;
          }),
    );
  });

  // CSS background-image (the hero backdrop) needs the same treatment
  [...root.querySelectorAll("*")].forEach((el) => {
    const bgi = getComputedStyle(el).backgroundImage;
    const m = bgi && bgi.match(/url\("?(data:[^")]+)"?\)/);
    if (!m) return;
    jobs.push(
      new Promise((r) => {
        const im = new Image();
        im.onload = im.onerror = r;
        im.src = m[1];
      }),
    );
  });

  return Promise.all(jobs);
}
