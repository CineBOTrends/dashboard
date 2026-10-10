import { posterEl } from "../../components/movieCard.js";
import { ymdShort } from "../../core/dates.js";
import { h, icon } from "../../core/dom.js";

import { enc, go } from "../../core/router.js";
import { Data } from "../../core/store.js";

import { _num, money } from "./overseas.js";

// grp() groups the Indian way (2,66,464); dollars need 266,464.
export const usn = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
export const usd = (v) => "$" + usn(v);

export async function safeGlobal() {
  try {
    return normalizeGlobalManifest(await Data.globalManifest());
  } catch (e) {
    return null; // no manifest yet / offline -> section hidden
  }
}

function normalizeGlobalManifest(raw) {
  if (!raw || !Array.isArray(raw.movies)) return null;
  const movies = raw.movies
    .map((m) => {
      if (!m || !m.slug) return null;
      const entries = m.entries || {};
      const dates = (Array.isArray(m.dates) ? m.dates : Object.keys(entries))
        .filter((d) => /^\d{8}$/.test(String(d)))
        .map(String)
        .sort();
      if (!dates.length) return null;
      const latest = dates.includes(m.latest)
        ? m.latest
        : dates[dates.length - 1];
      return {
        slug: m.slug,
        title: m.title || m.slug,
        dates,
        latest,
        entries,
        cur: entries[latest] || {},
      };
    })
    .filter(Boolean)
    .sort((a, b) => _num(b.cur.gross) - _num(a.cur.gross));
  if (!movies.length) return null;
  return {
    currency: raw.currency || "USD",
    country: raw.country || "USA",
    movies,
  };
}

// "4 Oct 2026, 9:15 PM IST" from an ISO timestamp
export function fmtTracked(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return "";
  const tz = { timeZone: "Asia/Kolkata" };
  const date = d.toLocaleDateString("en-IN", {
    ...tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-IN", {
      ...tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s*(am|pm)$/i, (x) => " " + x.trim().toUpperCase());
  return `${date}, ${time} IST`;
}

export function globalCard(m, currency) {
  const c = m.cur;
  const poster = posterEl(m.title, m.slug);
  poster.append(
    h(
      "div",
      { class: "badges" },
      h(
        "span",
        { class: "badge overseastrack" },
        h("span", { class: "live-dot" }),
        "Global Tracking",
      ),
      h("span", { class: "badge nation" }, icon("globe"), " USA"),
    ),
  );
  const target = `/global/${enc(m.slug)}/${m.latest}`;
  const langs = (c.languages || []).join(" · ");
  const fmts = (c.formats || []).slice(0, 3).join("/");
  return h(
    "div",
    {
      class: "mcard",
      role: "button",
      tabindex: "0",
      onclick: () => go(target),
      onkeydown: (e) => {
        if (e.key === "Enter") go(target);
      },
    },
    poster,
    h(
      "div",
      { class: "body" },
      h("div", { class: "ttl" }, m.title),
      langs || fmts
        ? h("div", { class: "langs" }, langs + (fmts ? "  •  " + fmts : ""))
        : null,
      c.admissions || c.shows
        ? h(
            "div",
            { class: "cardmeta" },
            c.admissions
              ? h("span", { class: "g" }, usn(c.admissions) + " tickets")
              : null,
            c.shows
              ? h("span", { class: "rt" }, usn(c.shows) + " shows")
              : null,
          )
        : null,
      h(
        "div",
        { class: "card-gross" },
        h("span", { class: "cg-label" }, "Gross · " + ymdShort(m.latest)),
        h("span", { class: "cg-val" }, money(c.gross, currency)),
      ),
    ),
  );
}

export function globalSection(g) {
  if (!g) return null;
  const newest = g.movies
    .map((m) => m.cur.trackedAt)
    .filter(Boolean)
    .sort()
    .pop();
  return h(
    "section",
    { class: "section", id: "global" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "section-head" },
        h(
          "div",
          null,
          h(
            "div",
            { class: "eyebrow" },
            h("span", { class: "live-dot" }),
            "Global Tracking",
          ),
        ),
        newest
          ? h("div", { class: "meta" }, "Updated " + fmtTracked(newest))
          : null,
      ),
      h(
        "div",
        { class: "movie-grid" },
        ...g.movies.slice(0, 8).map((m) => globalCard(m, g.currency)),
      ),
    ),
  );
}
