/**
 * functions/img-proxy.js — Cloudflare Pages Function, matches /img-proxy exactly.
 *
 * Why this exists: og:image/twitter:image were pointing straight at
 * third-party source CDNs (news sites etc). Those CDNs serve fine to
 * ordinary requests but some silently block known social-crawler ASNs/UAs,
 * which makes X/Twitter/Facebook drop the card entirely with no visible
 * error. Routing the image through our own domain means the crawler only
 * ever talks to cinebotrends.com, and Cloudflare's edge cache does the
 * fetch from the source once and reuses it.
 */

const MAX_BYTES = 10 * 1024 * 1024; // refuse to mirror anything absurdly large

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get("u");

  if (!target) return new Response("Missing u param", { status: 400 });

  let remote;
  try {
    remote = new URL(target);
  } catch (_e) {
    return new Response("Invalid url", { status: 400 });
  }
  if (remote.protocol !== "https:") {
    return new Response("Only https sources allowed", { status: 400 });
  }

  let res;
  try {
    res = await fetch(remote.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CineBOTrendsImageProxy/1.0)",
      },
      cf: { cacheTtl: 31536000, cacheEverything: true },
    });
  } catch (_e) {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (!res.ok) {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return new Response("Upstream did not return an image", { status: 415 });
  }

  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > MAX_BYTES) {
    return new Response("Upstream image too large", { status: 413 });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
