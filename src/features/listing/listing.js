import { mount, page } from "../../components/chrome.js";
import { movieCard } from "../../components/movieCard.js";
import { fetchError, loading, stateMsg } from "../../components/states.js";
import { frag, h, icon } from "../../core/dom.js";
import {
  FORMAT_ORDER,
  ctx,
  latest,
  loadAdvanceFeeds,
  loadLive,
  mergeFeeds,
} from "../../core/feeds.js";
import { ymdDow, ymdShort } from "../../core/dates.js";
import { fmtDate } from "../../core/format.js";
import { Data } from "../../core/store.js";
import { cap } from "../home/featureCarousel.js";
import { fmtTracked, globalCard, safeGlobal } from "../home/globalStrip.js";
import { overseasSection, safeOverseas } from "../home/overseas.js";
import { comingSoonCard, safeComingSoon } from "../movie/comingSoon.js";

/* ============================================================
   Three separate listing screens, each opened from a home card:
     /live      Live Tracking     daily tracking  (movie page: Today + Historical)
     /advance   Advance Sales     advance sales   (movie page: Advance only)
     /overseas  Overseas Tracking global tracking (Global page)
   They share one layout: search + language / format / sort filters over a
   grid of cards. Every screen turns its data into the same plain items
   ({ title, langs, fmts, gross, occ, shows, card }) so filtering and sorting
   are written once.
   ============================================================ */

const noData = (icn, title, msg) =>
  mount(page(h("div", { class: "wrap" }, stateMsg(icn, title, msg))));

export const live = () => listing("live");
export const advanceList = () => listing("advance");
export const overseasList = () => listing("overseas");

async function listing(kind) {
  mount(page(h("div", { class: "wrap" }, loading())));
  try {
    if (kind === "live") return await liveScreen();
    if (kind === "advance") return await advanceScreen();
    return await overseasScreen();
  } catch (e) {
    console.error(e);
    mount(fetchError(e));
  }
}

/* ---- Live Tracking: the daily feed ---- */
async function liveScreen() {
  const c = await ctx();
  if (!c.dayDates.length)
    return noData(
      "film",
      "No live tracking yet",
      "Daily tracking appears here as soon as a film is running.",
    );
  // today's run + films whose live tracking finished and are waiting for the
  // next daily run (they stay, tagged "Completed", until it picks them up)
  const { date: dailyDate, prevDate, daily, today, carried } = await loadLive(c);
  // Date-wise: every live card carries its date and day number (release day =
  // Day 1), e.g. "Day 2 · Sat, 17 Oct"; a finished day that is waiting for the
  // next run reads "Completed · Day 1 · 16 Oct".
  const perFilm = (c.m && c.m.movieDates && c.m.movieDates.daily) || {};
  const dayNo = (slug, date) => {
    const list = (perFilm[slug] || c.dayDates || []).slice().sort();
    const i = list.indexOf(date);
    return i >= 0 ? i + 1 : 1;
  };
  const toItem = (mv, date, done) => ({
    title: mv.title,
    langs: mv.languages || [],
    fmts: mv.formats || [],
    gross: mv.gross || 0,
    occ: mv.occupancy || 0,
    shows: mv.shows || 0,
    card: () => {
      const el = movieCard(mv, "daily", date, { live: true });
      const body = el.querySelector(".body");
      const day = "Day " + dayNo(mv.slug, date);
      if (body)
        body.prepend(
          h(
            "div",
            { class: done ? "done-note" : "day-note" },
            done
              ? "Completed \u00b7 " + day + " \u00b7 " + ymdShort(date)
              : day +
                  " \u00b7 " +
                  ymdDow(date).charAt(0) +
                  ymdDow(date).slice(1, 3).toLowerCase() +
                  ", " +
                  ymdShort(date),
          ),
        );
      return el;
    },
  });
  const items = [
    ...today.map((mv) => toItem(mv, dailyDate, false)),
    ...carried.map((mv) => toItem(mv, prevDate, true)),
  ];
  render({
    title: "Live Tracking",
    eyebrow: "Nationwide · Live",
    live: true,
    updated: (daily && daily.last_updated) || fmtDate(dailyDate),
    items,
    empty: "No films are being tracked live right now.",
  });
}

/* ---- Advance Sales: pre-sale tracking (+ titles whose bookings aren't open) ---- */
async function advanceScreen() {
  const c = await ctx();
  const advFeeds = c.advDates.length ? await loadAdvanceFeeds(c) : [];
  // advance only: a film that is also running keeps its advance card here
  const entries = mergeFeeds(advFeeds, null, null);
  const soon = await safeComingSoon(entries.map((e) => e.mv.slug));
  if (!entries.length && !soon.length)
    return noData(
      "calendar",
      "No advance sales yet",
      "Advance booking tracking appears here once bookings open.",
    );
  const items = [
    ...entries.map((e) => ({
      title: e.mv.title,
      langs: e.mv.languages || [],
      fmts: e.mv.formats || [],
      gross: e.mv.indiaGross ?? e.mv.gross ?? 0,
      occ: e.mv.occupancy || 0,
      shows: e.mv.shows || 0,
      card: () => movieCard(e.mv, "advance", e.date, { advance: true }),
    })),
    // bookings not open yet (data/coming_soon.json): after the tracked titles
    ...soon.map((m) => ({
      title: m.title,
      langs: [],
      fmts: [],
      gross: -1,
      occ: -1,
      shows: -1,
      soon: true,
      card: () => comingSoonCard(m),
    })),
  ];
  const last = advFeeds.length ? advFeeds[advFeeds.length - 1] : null;
  render({
    title: "Advance Sales",
    eyebrow: "Nationwide · Advance booking",
    updated: (last && last.nat && last.nat.last_updated) || (last ? fmtDate(last.date) : ""),
    items,
    empty: "No films match.",
  });
}

/* ---- Overseas Tracking: the global (US) feed ---- */
async function overseasScreen() {
  const [g, ov] = await Promise.all([safeGlobal(), safeOverseas()]);
  const movies = g ? g.movies : [];
  if (!movies.length && !ov)
    return noData(
      "globe",
      "No overseas tracking yet",
      "Overseas tracking appears here once a title is tracked abroad.",
    );
  const newest = movies
    .map((m) => m.cur.trackedAt)
    .filter(Boolean)
    .sort()
    .pop();
  const items = movies.map((m) => ({
    title: m.title,
    langs: m.cur.languages || [],
    fmts: m.cur.formats || [],
    gross: m.cur.gross || 0,
    occ: m.cur.occupancy || 0,
    shows: m.cur.shows || 0,
    card: () => globalCard(m, g.currency),
  }));
  render({
    title: "Overseas Tracking",
    eyebrow: "Global · USA",
    live: true,
    updated: newest ? fmtTracked(newest) : "",
    items,
    extra: ov ? overseasSection(ov) : null,
    empty: "No titles match.",
  });
}

/* ---- shared layout ---- */
function render(o) {
  const items = o.items;
  const langs = [...new Set(items.flatMap((i) => i.langs))].sort();
  const fmts = FORMAT_ORDER.filter((f) => items.some((i) => i.fmts.includes(f)));
  const st = { q: "", lang: "", fmt: "", sort: "gross" };
  const grid = h("div", { class: "movie-grid", id: "grid" });

  function paint() {
    const q = st.q.toLowerCase();
    const list = items
      .filter((i) => {
        if (q && !i.title.toLowerCase().includes(q)) return false;
        // "coming soon" has no language / format, so a filter hides it
        if (st.lang && !i.langs.includes(st.lang)) return false;
        if (st.fmt && !i.fmts.includes(st.fmt)) return false;
        return true;
      })
      .sort((a, b) =>
        st.sort === "occupancy"
          ? b.occ - a.occ
          : st.sort === "shows"
            ? b.shows - a.shows
            : b.gross - a.gross,
      );
    if (!list.length) {
      grid.replaceChildren(
        h(
          "div",
          { style: "grid-column:1/-1" },
          stateMsg("search", o.empty || "No titles match", "Try clearing a filter."),
        ),
      );
      return;
    }
    grid.replaceChildren(...list.map((i) => i.card()));
  }

  const sel = (label, opts, on) =>
    h(
      "label",
      { class: "field" },
      icon(label[1]),
      h(
        "select",
        {
          "aria-label": label[0],
          onchange: (e) => {
            on(e.target.value);
            paint();
          },
        },
        h("option", { value: "" }, label[0]),
        ...opts.map((x) => h("option", { value: x }, x)),
      ),
    );

  const filters = h(
    "div",
    { class: "filters" },
    h(
      "label",
      { class: "field" },
      icon("search"),
      h("input", {
        type: "search",
        placeholder: "Search movies",
        oninput: (e) => {
          st.q = e.target.value;
          paint();
        },
      }),
    ),
    sel(["All languages", "comment"], langs, (v) => (st.lang = v)),
    sel(["All formats", "film"], fmts, (v) => (st.fmt = v)),
    sel(
      ["Sort: Gross", "sort-amount-down"],
      ["gross", "occupancy", "shows"].map(cap),
      (v) => (st.sort = v.toLowerCase()),
    ),
  );

  const section = h(
    "section",
    { class: "section" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "back-bar" },
        h(
          "div",
          { class: "crumb" },
          h("a", { href: "/home" }, "Home"),
          icon("angle-right"),
          h("span", null, o.title),
        ),
      ),
      h(
        "div",
        { class: "section-head" },
        h(
          "div",
          null,
          h(
            "div",
            { class: "eyebrow" },
            o.live ? h("span", { class: "live-dot" }) : null,
            o.eyebrow,
          ),
          h("h2", null, o.title),
        ),
        h(
          "div",
          { class: "meta" },
          (o.updated ? "Updated " + o.updated + " · " : "") + items.length + " titles",
        ),
      ),
      filters,
      h("div", { style: "height:18px" }),
      grid,
    ),
  );
  mount(page(frag(section, o.extra || null)));
  paint();
}
