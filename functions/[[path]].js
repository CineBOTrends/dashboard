/**
 * functions/[[path]].js  — Cloudflare Pages Function, matches EVERY request.
 *
 * Why this exists: cinebotrends.com is a single-page app. Social/link-preview
 * crawlers (Facebook, Twitter/X, WhatsApp, Slack, etc.) never run JavaScript,
 * so whatever <meta> tags exist in the static index.html are the ONLY thing
 * they ever see, no matter which page a person actually shared. This function
 * detects those crawlers and, for routes we have data for, hands back a tiny
 * HTML document with the right og:title / og:description / og:image for that
 * specific movie/news/review — instead of the generic homepage tags.
 *
 * Everyone else (real browsers) gets passed straight through untouched:
 * real static files (css/js/data/images) are served as-is, and app routes
 * that don't correspond to a real file (e.g. /boxoffice/some-slug) fall back
 * to index.html so the SPA boots and renders client-side exactly as before.
 */

const BOT_UA =
  /facebookexternalhit|Facebot|Twitterbot|WhatsApp|Slackbot|LinkedInBot|TelegramBot|Discordbot|Googlebot|bingbot|Pinterest|redditbot|SkypeUriPreview|vkShare|Applebot/i;

// Anything under these prefixes, or with a file extension, is a real static
// asset — always let it through untouched, bot or not.
const STATIC_PREFIXES = ["/data/", "/assets/", "/css/", "/js/", "/overseas/"];

function isStaticAsset(pathname) {
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return /\.[a-z0-9]+$/i.test(pathname); // has a file extension, e.g. .png .json
}

const SITE = "https://cinebotrends.com";
const DEFAULT_IMAGE = SITE + "/assets/og-default.png";

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function ogPage({ title, description, image, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = image || DEFAULT_IMAGE;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="CineBOTrends">
<meta property="og:type" content="article">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
</head><body>
<p><a href="${url}">${t}</a></p>
</body></html>`;
}

// Generic per-section fallback copy, used when we can't find a specific
// item's data (or for section index pages with no single slug).
const SECTION_DEFAULTS = {
  home: {
    title: "CineBOTrends — Real-Time Box Office Intelligence",
    description:
      "Track real-time Indian box office collections, advance bookings, occupancy, live ticket sales, movie news and analytics.",
  },
  movies: {
    title: "All Movies — CineBOTrends",
    description: "Browse every movie currently tracked on CineBOTrends.",
  },
  boxoffice: {
    title: "Box Office Updates — CineBOTrends",
    description:
      "Live and historical Indian box office collection updates, city and state-wise breakdowns.",
  },
  news: {
    title: "Movie News — CineBOTrends",
    description: "The latest Indian movie industry news.",
  },
  reviews: {
    title: "Movie Reviews — CineBOTrends",
    description: "Movie reviews and ratings from CineBOTrends.",
  },
  about: {
    title: "About — CineBOTrends",
    description:
      "About CineBOTrends, real-time Indian box office intelligence.",
  },
  contact: {
    title: "Contact — CineBOTrends",
    description: "Get in touch with the CineBOTrends team.",
  },
};

// Best-effort field lookup — different data files may use different key
// names for the same concept, so try a short list of likely candidates
// rather than assuming one exact schema.
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
}

// poster/image fields in this app's data are objects like {thumb, bg}, not
// plain URL strings — pull out a real URL regardless of which shape shows up.
function imageUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object")
    return value.thumb || value.bg || value.full || value.large || null;
  return null;
}

function pickImage(obj, keys) {
  for (const k of keys) {
    const url = imageUrl(obj && obj[k]);
    if (url) return url;
  }
  return null;
}

async function findItem(env, url, dataPath, slug) {
  try {
    const assetUrl = new URL(dataPath, url.origin);
    const res = await env.ASSETS.fetch(assetUrl.toString());
    if (!res.ok) return null;
    const json = await res.json();
    const list = Array.isArray(json) ? json : json.items || json.list || [];
    return list.find((it) => it && it.slug === slug) || null;
  } catch (_e) {
    return null;
  }
}

async function getJson(env, url, path) {
  try {
    const res = await env.ASSETS.fetch(new URL(path, url.origin).toString());
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    return null;
  }
}

// Mirrors S.movie()'s tab/mode/date resolution in screens.js, simplified:
// walk the movie's own date list (from manifest.movieDates) most-recent-first
// until a day's file for this movie actually exists, and read its poster.
async function findMoviePoster(env, url, slug, restParts) {
  const manifest = await getJson(env, url, "/data/manifest.json");
  const movieDates = (manifest && manifest.movieDates) || {};
  const mineDay = (movieDates.daily && movieDates.daily[slug]) || [];
  const mineAdv = (movieDates.advance && movieDates.advance[slug]) || [];

  let tab =
    restParts.find((t) => ["advance", "daily", "historical"].includes(t)) ||
    null;
  const urlDate = restParts.find((t) => /^\d{8}$/.test(t)) || null;

  if (!tab)
    tab = mineDay.length ? "daily" : mineAdv.length ? "advance" : "historical";
  const mode =
    tab === "historical" ? (mineDay.length ? "daily" : "advance") : tab;
  const dates = (mode === "advance" ? mineAdv : mineDay)
    .slice()
    .sort()
    .reverse(); // newest first

  const ordered = urlDate
    ? [urlDate, ...dates.filter((d) => d !== urlDate)]
    : dates;

  // Cap the walk-back so a bot request can't trigger unbounded fetches.
  for (const d of ordered.slice(0, 6)) {
    const movie = await getJson(env, url, `/data/${mode}/${d}/m/${slug}.json`);
    if (movie) return movie;
  }

  // Per-movie file missing/empty for every date tried — national.json for
  // that date is a summary list of all movies and has the same poster shape.
  for (const d of ordered.slice(0, 3)) {
    const national = await getJson(
      env,
      url,
      `/data/${mode}/${d}/national.json`,
    );
    const list = (national && national.movies) || [];
    const found = list.find((m) => m && m.slug === slug);
    if (found) return found;
  }

  const hist = await getJson(env, url, `/data/${mode}/history/${slug}.json`);
  return hist ? { title: hist.title, poster: null } : null;
}

// Mirrors window.__CBO.render()'s dispatch in app.js — figure out which
// section/slug a path refers to, and build OG data for it.
async function buildOgData(env, url) {
  const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  const [section, slug] = parts;
  const path = "/" + parts.join("/");
  const canonical = SITE + path;

  const routeToDataFile = {
    news: "/data/news.json",
    reviews: "/data/reviews.json",
    boxoffice: "/data/boxoffice.json",
  };

  if (slug && routeToDataFile[section]) {
    const item = await findItem(env, url, routeToDataFile[section], slug);
    if (item) {
      return {
        title:
          pick(item, ["title", "name", "headline"]) ||
          SECTION_DEFAULTS[section].title,
        description:
          pick(item, ["description", "summary", "excerpt", "subtitle"]) ||
          SECTION_DEFAULTS[section].description,
        image: pickImage(item, ["image", "poster", "thumbnail", "thumb"]),
        url: canonical,
      };
    }
  }

  if (section === "movie" && slug) {
    const movie = await findMoviePoster(env, url, slug, parts.slice(2));
    const readable = decodeURIComponent(slug).replace(/[-_]+/g, " ").trim();
    const fallbackTitle = readable
      ? readable.replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    return {
      title:
        (movie && pick(movie, ["title", "name"])) ||
        (fallbackTitle
          ? fallbackTitle + " — CineBOTrends"
          : SECTION_DEFAULTS.home.title),
      description: SECTION_DEFAULTS.boxoffice.description,
      image: movie ? pickImage(movie, ["poster", "image"]) : null,
      url: canonical,
    };
  }

  const fallback = SECTION_DEFAULTS[section] || SECTION_DEFAULTS.home;
  return { ...fallback, image: null, url: canonical };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Real static files (css/js/data/images/etc.) always pass straight through.
  if (isStaticAsset(url.pathname)) {
    return env.ASSETS.fetch(request);
  }

  const ua = request.headers.get("User-Agent") || "";
  if (BOT_UA.test(ua)) {
    const og = await buildOgData(env, url);
    return new Response(ogPage(og), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Real visitor hitting an app route with no matching static file
  // (e.g. /boxoffice/some-slug) — serve the SPA shell so it boots and
  // renders the route client-side, same as before.
  const shell = await env.ASSETS.fetch(new URL("/index.html", url.origin));
  return new Response(shell.body, {
    status: shell.status,
    headers: shell.headers,
  });
}
