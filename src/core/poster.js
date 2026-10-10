const BASE = "/assets/posters";

/** Poster URL for a movie slug: the single convention shared with the pipeline. */
export function posterUrl(slug, kind = "thumb") {
  if (!slug) return "";
  const k = kind === "bg" ? "bg" : "thumb";
  return `${BASE}/${encodeURIComponent(slug)}-${k}.jpg`;
}
