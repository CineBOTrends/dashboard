import { posterUrl } from "../../core/poster.js";
import { mount, page } from "../../components/chrome.js";
import { mi } from "../../components/kv.js";
import { posterEl } from "../../components/movieCard.js";
import { fetchError, loading, stateMsg } from "../../components/states.js";
import { dayLabel, dayNumber, isOpeningDate, isPremiereDate, ymdShort } from "../../core/dates.js";
import { frag, h, icon } from "../../core/dom.js";
import { DL } from "../../core/exportState.js";
import { ctx, latest, modeLabel } from "../../core/feeds.js";
import { fmtUpdated } from "../../core/format.js";
import { enc, go } from "../../core/router.js";
import { Data } from "../../core/store.js";
import { renderTrackTab } from "./breakdown.js";
import { renderHistorical } from "./historicalTab.js";

export const movie = async function (p) {
  const slug = p[1];
  // parse tokens after slug
  let tab = null,
    date = null,
    stateName = null,
    cityName = null;
  for (let i = 2; i < p.length; i++) {
    const t = p[i];
    if (["advance", "daily", "historical"].includes(t)) tab = t;
    else if (/^\d{8}$/.test(t)) date = t;
    else if (t === "state") stateName = p[++i];
    else if (t === "city") cityName = p[++i];
  }
  // Switching tabs within the same movie: keep the current page on screen
  // (no loader flash, no scroll reset) until the new content is ready.
  const prev = document.getElementById("tabbody");
  const sameMovie = !!prev && prev.dataset.slug === slug;
  if (!sameMovie) mount(page(h("div", { class: "wrap" }, loading())));
  try {
    const c = await ctx();
    // Narrow the GLOBAL date lists to the ones THIS movie actually has data
    // for. modes.<mode>.dates is every date in the tree, so without this a
    // film shows chips for another film's dates (e.g. a different release
    // day) that 404 when opened. manifest.movieDates is the per-movie map.
    const md = c.m.movieDates || {};
    const mineAdv = (md.advance && md.advance[slug]) || null;
    const mineDay = (md.daily && md.daily[slug]) || null;
    if (mineAdv) c.advDates = c.advDates.filter((d) => mineAdv.includes(d));
    if (mineDay) c.dayDates = c.dayDates.filter((d) => mineDay.includes(d));

    // Unreleased film: District lists it on future dates beyond its opening
    // day too (advance seat maps open for a range), so movieDates can show
    // e.g. both 17 Jul (opening day) and 23 Jul (a normal advance date for
    // a later show). Both are real, selectable dates — only the LABELLING
    // of each one changes (see openingDay/isOpeningDate below), so we no
    // longer collapse advDates down to a single date here.

    const hasAdv = c.advDates.length,
      hasDay = c.dayDates.length;
    if (!tab) tab = hasDay ? "daily" : hasAdv ? "advance" : "historical"; // spec default = Daily
    // resolve mode + date
    // Historical = accumulated DAILY tracking, so the hero/info card and the
    // history file both come from the daily feed (advance only as a fallback).
    let mode = tab === "historical" ? (hasDay ? "daily" : "advance") : tab;
    let dates = mode === "advance" ? c.advDates : c.dayDates;
    if (tab !== "historical" && (!date || !dates.includes(date)))
      date = latest(dates);

    // load movie (need a representative date for hero/meta even on historical)
    // NOTE: the date must come from the SAME feed as `mode`, or we ask for
    // e.g. daily/<an-advance-date>/<slug>, get a 404, and render an empty hero.
    const metaDate =
      date || latest(mode === "advance" ? c.advDates : c.dayDates);
    let movie = null,
      hist = null,
      staleDate = null;
    if (tab === "historical") {
      try {
        hist = await Data.history(mode, slug);
      } catch (e) {
        hist = null;
      }
      try {
        movie = await Data.movie(mode, metaDate, slug);
      } catch (e) {
        movie = null;
      }
      // hero/meta is tab-independent -> fall back to the other feed if needed
      if (!movie) {
        const alt = mode === "daily" ? "advance" : "daily";
        const altDate = latest(alt === "advance" ? c.advDates : c.dayDates);
        if (altDate) {
          try {
            movie = await Data.movie(alt, altDate, slug);
          } catch (e) {
            movie = null;
          }
        }
      }
    } else if (dates.length) {
      // `dates` is the GLOBAL list for the mode. A movie may not appear in the
      // newest file yet (today's run hasn't picked it up, or tracking stopped),
      // which used to render "Not tracked" even though earlier days exist.
      // Walk backwards to the most recent date this movie is actually in.
      const wanted = date;
      const from = Math.max(dates.indexOf(wanted), 0);
      for (let i = from; i >= 0 && !movie; i--) {
        try {
          const mv = await Data.movie(mode, dates[i], slug);
          if (mv) {
            movie = mv;
            date = dates[i];
          }
        } catch (e) {
          /* not in this day's file — keep walking back */
        }
      }
      // flag it so the UI can say "today isn't in yet, showing <date>"
      if (movie && date !== wanted) staleDate = wanted;
    } else {
      try {
        movie = await Data.movie(
          hasAdv ? "advance" : "daily",
          metaDate,
          slug,
        );
      } catch (e) {
        movie = null;
      }
    }

    renderMovie({
      c,
      slug,
      tab,
      mode,
      date,
      dates,
      stateName,
      cityName,
      movie,
      hist,
      staleDate,
    });
  } catch (e) {
    console.error(e);
    mount(fetchError(e));
  }
};

function renderMovie(s) {
  const {
    c,
    slug,
    tab,
    mode,
    date,
    dates,
    stateName,
    cityName,
    movie,
    hist,
  } = s;
  const title = (movie && movie.title) || (hist && hist.title) || slug;

  // breadcrumb
  const crumb = h(
    "div",
    { class: "crumb" },
    h("a", { href: "/home" }, "Home"),
    icon("angle-right"),
    h(
      "a",
      {
        href: "/home",
        onclick: (e) => {
          e.preventDefault();
          go("/home");
        },
      },
      "Movies",
    ),
    icon("angle-right"),
    h("a", { href: `/movie/${enc(slug)}` }, title),
    stateName &&
      frag(
        icon("angle-right"),
        h(
          "a",
          {
            href: `/movie/${enc(slug)}/${tab}/${date}/state/${enc(stateName)}`,
          },
          stateName,
        ),
      ),
    cityName && frag(icon("angle-right"), h("span", null, cityName)),
  );

  // movie hero
  const meta = (movie && movie.meta) || {};
  const poster = posterEl(title, slug);
  const langs =
    (meta.languages && meta.languages.length
      ? meta.languages
      : movie && movie.languages) || [];
  const fmts = (movie && movie.formats) || [];
  const genres = meta.genres || [];
  const hero = h(
    "div",
    { class: "movie-hero has-bg" },
    h("div", {
      class: "mh-bg",
      style: `background-image:url("${posterUrl(slug, "bg")}")`,
    }),
    poster,
    h(
      "div",
      { class: "mh-info" },
      h("div", { class: "eyebrow" }, modeLabel(c, mode) + " · India"),
      h("h1", null, title),
      h(
        "div",
        { class: "chips" },
        ...langs.map((l) => h("span", { class: "chip" }, l)),
        ...fmts.map((f) => h("span", { class: "chip plain" }, f)),
        meta.likes
          ? h(
              "span",
              { class: "chip solid" },
              icon("heart"),
              " " + meta.likes,
            )
          : null,
      ),
      h(
        "div",
        { class: "meta-grid" },
        mi(
          "Genre",
          genres.length ? genres.join(", ") : "Not in dataset",
          !genres.length,
        ),
        mi("Runtime", meta.runTime || "Not in dataset", !meta.runTime),
        mi(
          "Certification",
          meta.certification || "Not in dataset",
          !meta.certification,
        ),
        mi("Languages", langs.join(", ") || "—"),
        mi("Formats", fmts.join(", ") || "—"),
      ),
    ),
    movie && movie.last_updated
      ? h(
          "div",
          { class: "mh-updated" },
          "Updated " + fmtUpdated(movie.last_updated),
        )
      : null,
  );

  // tabs
  const mkTab = (id, label) =>
    h(
      "button",
      {
        class: "tab" + (tab === id ? " on" : ""),
        onclick: () => go(`/movie/${enc(slug)}/${id}`),
      },
      label,
    );
  const tabs = h(
    "div",
    { class: "tabs" },
    mkTab("advance", "Advance"),
    mkTab("daily", "Today"),
    mkTab("historical", "Historical"),
  );

  // filename + export-card context for section downloads
  const ctxLabel =
    date && isPremiereDate(movie, date)
      ? "Premiere"
      : date && isOpeningDate(movie, date)
        ? "Opening Day"
        : tab === "historical"
          ? "Historical"
          : !date
            ? tab === "advance"
              ? "Advance"
              : "Today"
            : tab === "advance"
              ? "Advance " + ymdShort(date)
              : dayLabel(date, dates, movie);
  const dmeta = (movie && movie.meta) || {};
  DL.meta = {
    title,
    ctxLabel,
    date,
    langs:
      (dmeta.languages && dmeta.languages.length
        ? dmeta.languages
        : movie && movie.languages) || [],
    genres: dmeta.genres || [],
    runtime: dmeta.runTime || dmeta.runtime || "",
    poster: { thumb: posterUrl(slug, "thumb"), bg: posterUrl(slug, "bg") },
    updated:
      movie && movie.last_updated ? fmtUpdated(movie.last_updated) : "",
    kpi: movie && movie.kpi ? movie.kpi : null,
  };
  DL.ctx =
    slug +
    "_" +
    (tab === "historical"
      ? "historical"
      : !date
        ? tab
        : tab === "advance"
          ? "advance_" + ymdShort(date)
          : isPremiereDate(movie, date)
            ? "premiere"
            : "day_" + dayNumber(date, dates, movie));

  const prevBody = document.getElementById("tabbody");
  const body = h("div", { class: "tab-body", id: "tabbody" });
  body.dataset.slug = slug;

  mount(
    page(
      h(
        "div",
        { class: "wrap" },
        h("div", { class: "back-bar" }, crumb),
        hero,
        tabs,
        body,
      ),
    ),
    { keepScroll: !!prevBody && prevBody.dataset.slug === slug },
  );

  // fill tab body
  if (tab === "historical") return renderHistorical(body, hist, title, movie);
  if (!dates.length)
    return body.replaceChildren(
      stateMsg(
        "calendar",
        (mode === "daily" ? "Today's" : "Advance") +
          " tracking hasn't started",
        mode === "daily"
          ? "Today's collections appear here once the collector runs in daily mode."
          : "No advance data is available yet.",
      ),
    );
  if (!movie)
    return body.replaceChildren(
      stateMsg(
        "film",
        "Not tracked",
        "This title has no detail for the selected date.",
      ),
    );

  renderTrackTab(body, s, movie);
}
