// functions/_middleware.js
// Per-page social preview tags (og:/twitter:) injected into the HTML response,
// plus a real 404 status for paths the app does not route.
// No bot detection: crawlers and browsers get the same tags instantly.
const SITE = "https://cinebotrends.com";
// 1200x630 (2:1), ~100 KB. The old default pointed at /public/assets/..., which
// does not exist on the deployed site (SPA fallback returned HTML), and the file
// itself was a 3000x3000 / 2 MB square that X refuses to render reliably.
const DEFAULT_IMAGE = SITE + "/assets/cbot_og.jpg";
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
// content-type check is what proves an image really exists. Returns the etag
// too, so the og:image URL can carry a version and X re-fetches a changed poster.
const imageInfo = async (env, url, path) => {
  try {
    const r = await env.ASSETS.fetch(new URL(path, url.origin).toString(), {
      method: "HEAD",
    });
    if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) return null;
    const tag = (r.headers.get("etag") || r.headers.get("last-modified") || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-10);
    return { path, tag };
  } catch {
    return null;
  }
};

// Poster rule: ONLY assets/posters/<slug>-bg.jpg (1280x640). No -og fallback;
// when the file is missing the site default card is used instead.
const posterFor = async (env, url, slug) => {
  const bg = await imageInfo(env, url, `/assets/posters/${slug}-bg.jpg`);
  return bg ? { ...bg, og: false } : null;
};

// Earliest tracked date AFTER today (IST), else the newest: opening day until
// it arrives, then each following day. Mirrors upcomingDate() in
// src/core/dates.js.
const upcomingOf = (list, fallback) => {
  const ds = (list || [])
    .map(String)
    .filter((d) => /^\d{8}$/.test(d))
    .sort();
  if (!ds.length) return fallback || null;
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10).replace(/-/g, "");
  return ds.find((d) => d > today) || ds[ds.length - 1];
};
const upcoming = (m) => upcomingOf(m.dates || Object.keys(m.entries || {}), m.latest);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtYmd = (ymd) =>
  ymd ? `${+ymd.slice(6, 8)} ${MONTHS[+ymd.slice(4, 6) - 1]} ${ymd.slice(0, 4)}` : "";

const titleCase = (slug) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
  movies: ["All Movies — CineBOTrends", "Browse every movie currently tracked on CineBOTrends."],
  boxoffice: [
    "Box Office Updates — CineBOTrends",
    "Live and historical Indian box office collection updates.",
  ],
  news: ["Movie News — CineBOTrends", "The latest Indian movie industry news."],
  reviews: ["Movie Reviews — CineBOTrends", "Movie reviews and ratings from CineBOTrends."],
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
    const found = man && (man.movies || []).find((x) => x.slug === slug);
    // Not in the manifest (yet): still give crawlers a titled card + poster,
    // instead of the generic site card that then gets cached by X.
    const m = found || { slug, title: titleCase(slug), entries: {} };
    const entries = m.entries || {};
    const cur = entries[third] || entries[upcoming(m)] || {};
    const gross = cur.gross ? ` · $${Math.round(cur.gross).toLocaleString("en-US")} gross` : "";
    return {
      title: `${m.title} — USA Box Office | CineBOTrends`,
      desc: `Global tracking for ${m.title}${gross}. State, theatre, format, language and chain-wise breakdown.`,
      // poster files may be named differently from the overseas slug
      // (ranabaali--2026 -> ranabaali): manifest posterSlug, else strip "--<suffix>"
      image: await posterFor(
        env,
        url,
        m.posterSlug || String(slug).replace(/--[^-]+$|-+\d{4}$/, ""),
      ),
    };
  }

  // ---- Movie: /movie/<slug>/[advance|daily|historical]/[date]/... ----
  // Same default the app uses: no tab -> daily, else advance, else historical;
  // no date -> advance opens the earliest date AFTER today (opening day until
  // it arrives, then the next tracked day), daily opens the newest day.
  if (section === "movie" && slug) {
    const mv = await lookupMovie(env, url, slug);
    const rest = p.slice(2);
    let tab = rest.find((x) => ["advance", "daily", "historical"].includes(x));
    let date = rest.find((x) => /^\d{8}$/.test(x)) || null;

    const man = await getJson(env, url, "/data/manifest.json");
    const md = (man && man.movieDates) || {};
    const advDates = (md.advance && md.advance[mv.slug]) || [];
    const dayDates = (md.daily && md.daily[mv.slug]) || [];
    // Bookings not open yet (data/coming_soon.json): a "Coming Soon" card with
    // the collector's message instead of a misleading historical card.
    if (!dayDates.length && !advDates.length) {
      const cs = await getJson(env, url, "/data/coming_soon.json");
      const it = cs && (cs.movies || []).find((x) => x.slug === mv.slug);
      if (it) {
        const rel = fmtYmd(String(it.releaseDate || "").replace(/-/g, ""));
        const name = it.title || mv.title;
        return {
          title: `${name} — Coming Soon | CineBOTrends`,
          desc:
            (it.message || cs.message || "Advance bookings yet to open. Check back soon.") +
            (rel ? ` Releases ${rel}.` : ""),
          image: await posterFor(env, url, mv.slug),
        };
      }
    }
    if (!tab) tab = dayDates.length ? "daily" : advDates.length ? "advance" : "historical";
    if (tab === "advance" && !date) date = upcomingOf(advDates);
    if (tab === "daily" && !date && dayDates.length) date = [...dayDates].map(String).sort().pop();

    const when = date ? fmtYmd(date) : "";
    let title;
    let desc;
    if (tab === "advance") {
      title = `${mv.title} — Advance Booking${when ? " · " + when : ""} | CineBOTrends`;
      desc = `Advance booking collection for ${mv.title}${when ? " for " + when : ""}: state, city, format and language wise breakdown.`;
    } else if (tab === "daily") {
      title = `${mv.title} — Daily Box Office${when ? " · " + when : ""} | CineBOTrends`;
      desc = `Day-wise box office collection for ${mv.title}${when ? " on " + when : ""}: state, city, format and language wise breakdown.`;
    } else {
      title = `${mv.title} — Historical Box Office | CineBOTrends`;
      desc = `Day-by-day historical box office collections for ${mv.title}.`;
    }
    return { title, desc, image: await posterFor(env, url, mv.slug) };
  }

  // ---- News / reviews / boxoffice item ----
  if (slug && DATA_FILES[section]) {
    const json = await getJson(env, url, DATA_FILES[section]);
    const list = Array.isArray(json) ? json : (json && (json.items || json.list)) || [];
    const item = list.find((it) => it && it.slug === slug);
    if (item) {
      // item image: the movie's poster when linked, else the item's own image
      let image = null;
      if (item.movieSlug) image = await posterFor(env, url, item.movieSlug);
      if (!image && typeof item.image === "string" && item.image)
        image = { path: item.image, og: false };
      return {
        title: pick(item, ["title", "name", "headline"]) || SECTION_DEFAULTS[section][0],
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
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;

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

  const ver = m.image && m.image.tag ? "?v=" + m.image.tag : "";
  const img = m.image
    ? m.image.path.startsWith("http")
      ? m.image.path
      : url.origin + m.image.path + ver
    : DEFAULT_IMAGE;
  // Advertise 1200x630 only for images known to be that size (the default
  // card and generated og images). Poster -bg files are 1280x640 (2:1) and
  // need no declared size.
  const dims =
    !m.image || m.image.og
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
    `<meta property="og:image:type" content="image/jpeg">` +
    `<meta property="og:image:alt" content="${esc(m.title)}">` +
    `<meta property="og:url" content="${esc(url.origin + url.pathname)}">` +
    `<link rel="canonical" href="${esc(url.origin + url.pathname)}">` +
    `<meta name="description" content="${esc(m.desc)}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta property="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:site" content="@cinebotrends">` +
    `<meta property="twitter:site" content="@cinebotrends">` +
    `<meta name="twitter:title" content="${esc(m.title)}">` +
    `<meta property="twitter:title" content="${esc(m.title)}">` +
    `<meta name="twitter:description" content="${esc(m.desc)}">` +
    `<meta property="twitter:description" content="${esc(m.desc)}">` +
    `<meta name="twitter:image" content="${esc(img)}">` +
    `<meta property="twitter:image" content="${esc(img)}">` +
    `<meta name="twitter:image:alt" content="${esc(m.title)}">` +
    `<meta property="twitter:image:alt" content="${esc(m.title)}">`;

  return new HTMLRewriter()
    .on("title", { element: (e) => e.setInnerContent(m.title) })
    .on('meta[property^="og:"]', { element: (e) => e.remove() })
    .on('meta[name^="twitter:"]', { element: (e) => e.remove() })
    .on('meta[property^="twitter:"]', { element: (e) => e.remove() })
    .on('meta[name="description"]', { element: (e) => e.remove() })
    .on('link[rel="canonical"]', { element: (e) => e.remove() })
    .on("head", { element: (e) => e.append(tags, { html: true }) })
    .transform(res);
}
