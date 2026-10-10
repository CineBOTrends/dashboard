import {
  DATA_TTL_MS,
  NEW_DATA_LAYOUT,
  SUPPORTED_SCHEMA_MAJOR,
} from "./config.js";

const cache = new Map(); // path -> { at, promise }

export class SchemaError extends Error {
  constructor(version) {
    super(
      `This data uses schema ${version}, which this version of the site can't read. Please refresh the page.`,
    );
    this.name = "SchemaError";
  }
}

/** Cached fetch with in-flight de-duplication and short-TTL revalidation. */
export function getJSON(path, { fresh = false } = {}) {
  const hit = cache.get(path);
  if (hit && !fresh && Date.now() - hit.at < DATA_TTL_MS) return hit.promise;
  const promise = fetch(path, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status + " for " + path);
    return r.json();
  });
  const entry = { at: Date.now(), promise };
  cache.set(path, entry);
  promise.catch(() => {
    if (cache.get(path) === entry) cache.delete(path);
  });
  return promise;
}

export const clearCache = () => cache.clear();

const major = (v) => parseInt(String(v).split(".")[0], 10);

// Try the new layout first, then the legacy one (dual-write migration).
async function firstOf(...paths) {
  let err;
  for (const p of paths) {
    if (!p) continue;
    try {
      return await getJSON(p);
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

export const Data = {
  async manifest() {
    const m = await getJSON("/data/manifest.json");
    if (m && m.schemaVersion != null && major(m.schemaVersion) > SUPPORTED_SCHEMA_MAJOR)
      throw new SchemaError(m.schemaVersion);
    return m;
  },
  national: (mode, date) => getJSON(`/data/${mode}/${date}/national.json`),
  multiplex: (mode, date) => getJSON(`/data/${mode}/${date}/multiplex.json`),

  // Summary first (states + cities, no theatre rows); theatres load on demand.
  movie: (mode, date, slug) =>
    firstOf(
      NEW_DATA_LAYOUT && `/data/${mode}/${date}/movies/${slug}/summary.json`,
      `/data/${mode}/${date}/m/${slug}.json`,
    ),
  // detail = state.detail from the summary, e.g. "theatres/gujarat.json"
  theatres: (mode, date, slug, detail) =>
    getJSON(`/data/${mode}/${date}/movies/${slug}/${detail}`),

  // One history file per movie. When the daily and advance histories differ
  // the shared file carries a `mode`; use it only if it matches, otherwise
  // read the legacy per-mode copy.
  history: async (mode, slug) => {
    if (NEW_DATA_LAYOUT) {
      try {
        const h = await getJSON(`/data/history/${slug}.json`);
        if (h && (!h.mode || h.mode === mode)) return h;
      } catch {
        /* fall through to the legacy file */
      }
    }
    return getJSON(`/data/${mode}/history/${slug}.json`);
  },

  moviesIndex: () => getJSON("/data/movies-index.json"),
  news: () => getJSON("/data/news.json"),
  reviews: () => getJSON("/data/reviews.json"),
  boxoffice: () => getJSON("/data/boxoffice.json"),

  // Overseas feeds come from a separate collector and live outside data/ on
  // purpose (the India collector replaces data/ wholesale on every publish).
  // They may not exist yet: callers treat a rejection as "no data".
  overseas: () => getJSON("/overseas/latest.json"),
  globalManifest: () => getJSON("/overseas/manifest.json"),
  globalSummary: (date, slug) =>
    getJSON(`/overseas/${date}/${slug}-summary.json`),
};
