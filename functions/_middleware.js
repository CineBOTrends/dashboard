// functions/_middleware.js
// Per-page social preview tags (og:/twitter:) injected into the HTML response,
// plus a real 404 status for paths the app does not route.
// No bot detection: crawlers and browsers get the same tags instantly.
const SITE = "https://cinebotrends.com";
const DEFAULT_IMAGE = SITE + "/public/assets/cbot_card.jpg";
// /bundle/ holds the hashed Vite output; /assets/ is brand + poster images.
const STATIC_PREFIXES = ["/data/", "/assets/", "/bundle/", "/fonts/", "/overseas/"];
const KNOWN_ROUTES = new Set([
  "",
  "home",
  "movies",
  "movie",
  "news",
  "reviews",
  "boxoffice",
  "multiplex",
  "global",
  "about",
  "contact",
]);

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const pick = (o, keys) => {
  for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k];
  return null;
};
const getJson = async (env, url, path) => {
  try {
    const r = await env.ASSETS.fetch(new URL(path, url.origin).toString());
    if (!r.ok) return null;
    if (!(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch {
    return null;
  }
};

// With SPA fallback a missing file returns index.html with 200, so the
// content-type check is what proves an image really exists.
const imageExists = async (env, url, path) => {
  try {
    const r = await env.ASSETS.fetch(new URL(path, url.origin).toString(), {
      method: "HEAD",
    });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
  } catch {
    return false;
  }
};

// Poster rule: <slug>-bg.jpg first, else <slug>-og.jpg, else null (default).
// `og` tells the caller whether the 1200x630 dimensions may be advertised.
const posterFor = async (env, url, slug) => {
  for (const [kind, og] of [["bg", false], ["og", true]]) {
    const path = `/assets/posters/${slug}-${kind}.jpg`;
    if (await imageExists(env, url, path)) return { path, og };
  }
  return null;
};

const titleCase = (slug) =>
  slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// movies-index.json: real titles and slug aliases. Optional - falls back to slug.
async function lookupMovie(env, url, slug) {
  const idx = await getJson(env, url, "/data/movies-index.json");
  if (!idx) return { slug, title: titleCase(slug) };
  const real = (idx.aliases && idx.aliases[slug]) || slug;
  const mv = (idx.movies || []).find((m) => m.slug === real);
  return { slug: real, title: (mv && mv.title) || titleCase(real) };
}

const DATA_FILES = {
  news: "/data/news.json",
  reviews: "/data/reviews.json",
  boxoffice: "/data/boxoffice.json",
};

const SECTION_DEFAULTS = {
  movies: [
    "All Movies — CineBOTrends",
    "Browse every movie currently tracked on CineBOTrends.",
  ],
  boxoffice: [
    "Box Office Updates — CineBOTrends",
    "Live and historical Indian box office collection updates.",
  ],
  news: ["Movie News — CineBOTrends", "The latest Indian movie industry news."],
  reviews: [
    "Movie Reviews — CineBOTrends",
    "Movie reviews and ratings from CineBOTrends.",
  ],
};

async function getMeta(url, env) {
  let p;
  try {
    p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [section, slug, third] = p;
  if (!section) return null;

  // ---- Global tracking: /global/<slug>/<date> ----
  if (section === "global" && slug) {
    const man = await getJson(env, url, "/overseas/manifest.json");
    const m = man && (man.movies || []).find((x) => x.slug === slug);
    if (!m) return null;
    const entries = m.entries || {};
    const cur = entries[third] || entries[m.latest] || {};
    const gross = cur.gross
      ? ` · $${Math.round(cur.gross).toLocaleString("en-US")} gross`
      : "";
    return {
      title: `${m.title} — USA Box Office | CineBOTrends`,
      desc: `Global tracking for ${m.title}${gross}. State, theatre, format, language and chain-wise breakdown.`,
      image: await posterFor(env, url, slug),
    };
  }

  // ---- Movie: /movie/<slug>/... ----
  if (section === "movie" && slug) {
    const mv = await lookupMovie(env, url, slug);
    return {
      title: `${mv.title} — Box Office | CineBOTrends`,
      desc: `Daily, advance and historical box office collections for ${mv.title}.`,
      image: await posterFor(env, url, mv.slug),
    };
  }

  // ---- News / reviews / boxoffice item ----
  if (slug && DATA_FILES[section]) {
    const json = await getJson(env, url, DATA_FILES[section]);
    const list = Array.isArray(json)
      ? json
      : (json && (json.items || json.list)) || [];
    const item = list.find((it) => it && it.slug === slug);
    if (item) {
      // item image: the movie's poster when linked, else the item's own image
      let image = null;
      if (item.movieSlug) image = await posterFor(env, url, item.movieSlug);
      if (!image && typeof item.image === "string" && item.image)
        image = { path: item.image, og: false };
      return {
        title:
          pick(item, ["title", "name", "headline"]) ||
          SECTION_DEFAULTS[section][0],
        desc:
          pick(item, ["description", "summary", "excerpt", "subtitle"]) ||
          SECTION_DEFAULTS[section][1],
        image,
      };
    }
  }

  // ---- Section index pages ----
  if (SECTION_DEFAULTS[section]) {
    return {
      title: SECTION_DEFAULTS[section][0],
      desc: SECTION_DEFAULTS[section][1],
      image: null,
    };
  }
  return null;
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // never touch static assets
  if (
    STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) ||
    /\.[a-z0-9]+$/i.test(url.pathname)
  ) {
    return next();
  }

  const res = await next();
  if (!(res.headers.get("content-type") || "").includes("text/html"))
    return res;

  // Unknown first segment: serve the shell (the app shows its not-found view)
  // but with a real 404 status so search engines don't index soft-404s.
  const first = url.pathname.split("/")[1] || "";
  if (!KNOWN_ROUTES.has(first.toLowerCase())) {
    return new Response(res.body, {
      status: 404,
      statusText: "Not Found",
      headers: res.headers,
    });
  }

  let m = null;
  try {
    m = await getMeta(url, env);
  } catch {
    m = null;
  }
  if (!m) return res;

  const img = m.image
    ? m.image.path.startsWith("http")
      ? m.image.path
      : url.origin + m.image.path
    : DEFAULT_IMAGE;
  // Only the generated 1200x630 og image may advertise its dimensions.
  const dims = m.image && m.image.og
    ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
    : "";

  const tags =
    `<meta property="og:type" content="website">` +
    `<meta property="og:site_name" content="CineBOTrends">` +
    `<meta property="og:title" content="${esc(m.title)}">` +
    `<meta property="og:description" content="${esc(m.desc)}">` +
    `<meta property="og:locale" content="en_IN">` +
    `<meta property="og:image" content="${esc(img)}">` +
    `<meta property="og:image:secure_url" content="${esc(img)}">` +
    dims +
    `<meta property="og:image:alt" content="${esc(m.title)}">` +
    `<meta property="og:url" content="${esc(url.origin + url.pathname)}">` +
    `<link rel="canonical" href="${esc(url.origin + url.pathname)}">` +
    `<meta name="description" content="${esc(m.desc)}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:site" content="@cinebotrends">` +
    `<meta name="twitter:title" content="${esc(m.title)}">` +
    `<meta name="twitter:description" content="${esc(m.desc)}">` +
    `<meta name="twitter:image" content="${esc(img)}">` +
    `<meta name="twitter:image:alt" content="${esc(m.title)}">`;

  return new HTMLRewriter()
    .on("title", { element: (e) => e.setInnerContent(m.title) })
    .on('meta[property^="og:"]', { element: (e) => e.remove() })
    .on('meta[name^="twitter:"]', { element: (e) => e.remove() })
    .on('meta[name="description"]', { element: (e) => e.remove() })
    .on('link[rel="canonical"]', { element: (e) => e.remove() })
    .on("head", { element: (e) => e.append(tags, { html: true }) })
    .transform(res);
}
