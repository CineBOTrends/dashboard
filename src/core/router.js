/* Real-path routing on the History API (not #hash), so the edge can see which
   page is requested and return per-page previews. A trailing "#fragment" is
   kept as an in-page anchor. */
export const enc = encodeURIComponent;
export const dec = decodeURIComponent;

let renderer = () => {};
export const setRenderer = (fn) => {
  renderer = fn;
};
export const rerender = () => renderer();

export function parsePath(pathname) {
  return pathname
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return dec(s);
      } catch {
        return s;
      }
    });
}
export const parts = () => parsePath(location.pathname);

export function normalizePath(path) {
  path = String(path || "/home");
  const i = path.indexOf("#");
  const frag = i === -1 ? "" : path.slice(i);
  let clean = i === -1 ? path : path.slice(0, i);
  if (!clean.startsWith("/")) clean = "/" + clean;
  return { clean, frag };
}

export function go(path) {
  const { clean, frag } = normalizePath(path);
  const full = clean + frag;
  if (full === location.pathname + location.hash) return;
  history.pushState(null, "", full);
  rerender();
  if (frag) {
    const el = document.getElementById(frag.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }
}

/* Same-origin <a href> clicks become SPA navigation; modified clicks, new-tab
   and download links keep their native behaviour. */
export function startRouter() {
  window.addEventListener("popstate", rerender);
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    let url;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) return;
    e.preventDefault();
    go(url.pathname + url.hash);
  });
}
