const BASE = "/assets/posters";

/** Poster URL for a movie slug: the single convention shared with the pipeline. */
export function posterUrl(slug, kind = "thumb") {
  if (!slug) return "";
  const k = kind === "bg" ? "bg" : "thumb";
  return `${BASE}/${encodeURIComponent(slug)}-${k}.jpg`;
}

/** Poster file slug for a global/overseas manifest entry. The overseas feed
 *  can use a different slug than the poster files (ranabaali--2026 vs
 *  ranabaali-thumb.jpg): prefer the manifest's posterSlug, else drop a
 *  trailing "--<suffix>". */
export function posterSlugOf(m) {
  if (!m) return "";
  return m.posterSlug || String(m.slug || "").replace(/--[^-]+$|-+\d{4}$/, "");
}

/** Every poster-file slug worth trying for a global/overseas entry, best first:
 *  manifest posterSlug, slug without "--2026"/"-2026", the title as a slug
 *  without its "(2026)", then the raw slug. posterEl() walks this list until
 *  an image loads, so a differently-named overseas slug still finds its poster. */
export function posterSlugsOf(m) {
  if (!m) return [];
  const slug = String(m.slug || "");
  const titleSlug = String(m.title || "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const out = [
    m.posterSlug,
    slug.replace(/--[^-]+$/, ""),
    slug.replace(/-+\d{4}$/, ""),
    titleSlug,
    slug,
  ].filter(Boolean);
  return [...new Set(out)];
}

const _posterOk = new Map();
/** First candidate whose thumb image actually loads (cached); falls back to
 *  the first candidate. Lets pages that need ONE slug (hero background, PNG
 *  export) pick the right poster files for a differently-named overseas slug. */
export async function resolvePosterSlug(cands) {
  const list = (cands || []).filter(Boolean);
  for (const s of list) {
    if (!_posterOk.has(s))
      _posterOk.set(
        s,
        new Promise((res) => {
          const im = new Image();
          im.onload = () => res(true);
          im.onerror = () => res(false);
          im.src = posterUrl(s, "thumb");
        }),
      );
    if (await _posterOk.get(s)) return s;
  }
  return list[0] || "";
}
