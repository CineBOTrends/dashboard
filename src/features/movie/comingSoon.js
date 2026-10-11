import { mount, page } from "../../components/chrome.js";
import { posterEl } from "../../components/movieCard.js";
import { stateMsg } from "../../components/states.js";
import { ymdDow, ymdLong, ymdShort } from "../../core/dates.js";
import { h, icon } from "../../core/dom.js";
import { posterUrl } from "../../core/poster.js";
import { enc, go } from "../../core/router.js";
import { Data } from "../../core/store.js";

/* ---- "Coming soon": titles whose advance bookings have not opened ----
   data/coming_soon.json is published by the collector:
   { message, movies: [{ slug, title, status, message, releaseDate, poster }] }
   A title appears here only until it has real tracking data; once it is in
   the manifest the normal pages take over (callers pass slugs to skip). */

const DEFAULT_MSG = "Advance bookings yet to open. Check back soon.";

// "2026-10-15" -> "20261015"
const toYmd = (d) => String(d || "").replace(/-/g, "").slice(0, 8);

const releaseText = (it) => {
  const y = toYmd(it.releaseDate);
  return /^\d{8}$/.test(y) ? ymdDow(y) + ", " + ymdShort(y) : "";
};

/** Items still waiting for bookings, minus any slug already tracked. Never throws. */
export async function safeComingSoon(skipSlugs) {
  try {
    const d = await Data.comingSoon();
    const skip = new Set(skipSlugs || []);
    return ((d && d.movies) || [])
      .filter((m) => m && m.slug && !skip.has(m.slug))
      .map((m) => ({ ...m, message: m.message || (d && d.message) || DEFAULT_MSG }));
  } catch (e) {
    return [];
  }
}

export function comingSoonCard(it) {
  const poster = posterEl(it.title, it.slug);
  poster.append(
    h(
      "div",
      { class: "badges" },
      h("span", { class: "badge soon" }, icon("calendar"), " Coming Soon"),
      h("span", { class: "badge nation" }, icon("globe"), " India"),
    ),
  );
  const target = `/movie/${enc(it.slug)}`;
  const rel = releaseText(it);
  return h(
    "div",
    {
      class: "mcard cs-card",
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
      h("div", { class: "ttl" }, it.title),
      rel ? h("div", { class: "cs-date" }, icon("calendar"), " Releases " + rel) : null,
      h("div", { class: "cs-msg" }, it.message || DEFAULT_MSG),
    ),
  );
}

/** Home-page strip (null when there is nothing to show). */
export function comingSoonSection(items) {
  if (!items || !items.length) return null;
  return h(
    "section",
    { class: "section", id: "coming-soon" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "section-head" },
        h("div", null, h("h2", null, "Coming Soon")),
      ),
      h("div", { class: "movie-grid" }, ...items.map(comingSoonCard)),
    ),
  );
}

/** Full page for /movie/<slug> when the title has no tracking data yet. */
export function showComingSoonPage(it) {
  const rel = releaseText(it);
  const y = toYmd(it.releaseDate);
  const crumb = h(
    "div",
    { class: "crumb" },
    h("a", { href: "/home" }, "Home"),
    icon("angle-right"),
    h("span", null, it.title),
  );
  const hero = h(
    "div",
    { class: "movie-hero has-bg" },
    h("div", {
      class: "mh-bg",
      style: `background-image:url("${posterUrl(it.slug, "bg")}")`,
    }),
    posterEl(it.title, it.slug),
    h(
      "div",
      { class: "mh-info" },
      h("div", { class: "eyebrow" }, "Coming Soon · India"),
      h("h1", null, it.title),
      h(
        "div",
        { class: "chips" },
        /^\d{8}$/.test(y)
          ? h("span", { class: "chip solid" }, icon("calendar"), " Releases " + ymdLong(y) + (rel ? " · " + rel.split(",")[0] : ""))
          : null,
      ),
    ),
  );
  mount(
    page(
      h(
        "div",
        { class: "wrap" },
        h("div", { class: "back-bar" }, crumb),
        hero,
        stateMsg("calendar", "Bookings not open yet", it.message || DEFAULT_MSG),
      ),
    ),
  );
}
