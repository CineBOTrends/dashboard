import { posterUrl } from "../../core/poster.js";
import "../../styles/global.css";
import { mount, page } from "../../components/chrome.js";
import { bdMetric } from "../../components/dateChips.js";
import { dlBtn } from "../../components/dlBtn.js";
import { posterEl } from "../../components/movieCard.js";
import { fetchError, loading, stateMsg } from "../../components/states.js";
import { ymdDow, ymdLong, ymdShort } from "../../core/dates.js";
import { h, icon } from "../../core/dom.js";
import { DL } from "../../core/exportState.js";
import { pct } from "../../core/format.js";
import { enc, go } from "../../core/router.js";
import { Data } from "../../core/store.js";
import { GLOBAL_TOP_THEATRES, globalTable, normalizeGlobalSummary } from "./summary.js";
import { fmtTracked, safeGlobal, usd, usn } from "../home/globalStrip.js";

export const global = async function (p) {
  const slug = p[1];
  const reqDate = p.slice(2).find((t) => /^\d{8}$/.test(t)) || null;
  mount(page(h("div", { class: "wrap" }, loading())));
  try {
    const g = await safeGlobal();
    const m = g && g.movies.find((x) => x.slug === slug);
    if (!m)
      return mount(
        page(
          h(
            "div",
            { class: "wrap" },
            stateMsg(
              "globe",
              "Global tracking not available",
              "This title isn't being tracked overseas yet.",
            ),
          ),
        ),
      );
    const date = m.dates.includes(reqDate) ? reqDate : m.latest;
    const sum = normalizeGlobalSummary(await Data.globalSummary(date, slug));
    if (!sum) throw new Error("Global summary for " + slug + " is empty");
    renderGlobal(m, date, sum);
  } catch (e) {
    console.error(e);
    mount(fetchError(e));
  }
};

function renderGlobal(m, date, sum) {
  const title = m.title;
  // poster files may be named differently from the overseas slug (ranabaali--2026 -> ranabaali);
  // publish_to_dashboard.py puts the matching name in the manifest as posterSlug
  const pslug = m.posterSlug || m.slug;
  const t = sum.total;
  const cur = m.entries[date] || {};
  const trackedIso = sum.trackedAt || cur.trackedAt || "";
  const tracked = fmtTracked(trackedIso);
  const path = (d) => `/global/${enc(m.slug)}/${d}`;

  // PNG export (dlBtn) reads these. kpi stays null: the export card formats
  // KPI chips in rupees, which would mislabel dollars.
  DL.ctx = "global_" + m.slug + "_" + date;
  DL.meta = {
    title,
    ctxLabel: "Global · " + ymdShort(date),
    date,
    langs: cur.languages || [],
    genres: [],
    runtime: "",
    poster: { thumb: posterUrl(pslug, "thumb"), bg: posterUrl(pslug, "bg") },
    updated: tracked,
    kpi: null,
  };

  const crumb = h(
    "div",
    { class: "crumb" },
    h("a", { href: "/home" }, "Home"),
    icon("angle-right"),
    h("a", { href: "/home#global" }, "Global Tracking"),
    icon("angle-right"),
    h("a", { href: path(date) }, title),
  );

  const poster = posterEl(title, pslug);
  const hasBg = !!pslug;
  const hero = h(
    "div",
    { class: "movie-hero" + (hasBg ? " has-bg" : "") },
    hasBg
      ? h("div", {
          class: "mh-bg",
          style: `background-image:url("${posterUrl(pslug, "bg")}")`,
        })
      : null,
    poster,
    h(
      "div",
      { class: "mh-info" },
      h("div", { class: "eyebrow" }, h("span", { class: "live-dot" }), "Global Tracking · USA"),
      h("h1", null, title),
      h(
        "div",
        { class: "chips" },
        h("span", { class: "chip solid" }, icon("globe"), " USA"),
        ...(cur.languages || []).map((l) => h("span", { class: "chip" }, l)),
        ...(cur.formats || []).map((f) => h("span", { class: "chip plain" }, f)),
      ),
    ),
    tracked ? h("div", { class: "mh-updated" }, "Updated " + tracked) : null,
  );

  // one chip per tracked show date (only when there's more than one)
  const daybar =
    m.dates.length > 1
      ? h(
          "div",
          { class: "daybar" },
          ...m.dates.map((d) =>
            h(
              "button",
              {
                class: "daychip" + (d === date ? " on" : ""),
                onclick: () => go(path(d)),
              },
              h("span", { class: "dc-t" }, "Show date"),
              h("span", { class: "dc-d" }, ymdShort(d)),
              h("span", { class: "dc-w" }, ymdDow(d)),
            ),
          ),
        )
      : null;

  const strip = h(
    "div",
    { class: "bd-strip g-strip" },
    bdMetric("Gross", usd(t.gross), null, true),
    bdMetric("Tickets", usn(t.sold), t.seats ? usn(t.seats) + " seats" : null),
    bdMetric("Shows", usn(t.shows)),
    bdMetric("Theatres", usn(t.theatres)),
    bdMetric("Cities", usn(t.cities), sum.states.length + " states"),
    bdMetric("Occupancy", pct(t.occupancy), "weighted avg"),
  );
  const summaryPanel = h(
    "section",
    { class: "bd-panel" },
    dlBtn("Global Summary", "on-head"),
    h(
      "div",
      { class: "bd-head static" },
      icon("globe"),
      h("span", { class: "bd-title" }, "Shows for " + ymdLong(date) + " · USA"),
    ),
    h(
      "div",
      { class: "bd-body" },
      strip,
      tracked ? h("div", { class: "bd-updated" }, "Last tracked: " + tracked) : null,
    ),
  );

  mount(
    page(
      h(
        "div",
        { class: "wrap" },
        h("div", { class: "back-bar" }, crumb),
        hero,
        daybar,
        summaryPanel,
        globalBreakdown(sum, tracked, {
          // manifest.json carries the exact (cache-busted) URL; the derived
          // path covers manifests published before report cards existed
          url: cur.report || `/overseas/${date}/${m.slug}-report.png`,
        }),
      ),
    ),
  );
}

function globalBreakdown(sum, tracked, report) {
  const t = sum.total;
  const empty = (msg) => h("div", { class: "perf-panel-body empty" }, msg);
  let showAllTheatres = false;

  // totals for the share-style tables: sums of rows, occupancy weighted by capacity
  const totalOf = (rows) => {
    const gross = rows.reduce((a, r) => a + r.gross, 0);
    const sold = rows.reduce((a, r) => a + r.sold, 0);
    const seats = rows.reduce((a, r) => a + r.seats, 0);
    const shows = rows.reduce((a, r) => a + r.shows, 0);
    return {
      gross,
      sold,
      shows,
      occupancy: seats ? (sold / seats) * 100 : t.occupancy,
    };
  };

  const tabs = [
    { id: "state", label: "State Wise", icon: "marker" },
    { id: "theatre", label: "Top Theatres", icon: "clapperboard-play" },
    { id: "format", label: "Format Wise", icon: "film" },
    { id: "language", label: "Language Wise", icon: "language" },
    { id: "chain", label: "Chain Wise", icon: "building" },
    { id: "report", label: "Full Report Card", icon: "picture" },
  ];
  let active = tabs[0];

  const contentFor = (key) => {
    if (key === "report") return reportCardPanel(report && report.url);
    if (key === "state") {
      if (!sum.states.length) return empty("No state-wise breakdown available.");
      return h(
        "div",
        { class: "perf-panel-body" },
        globalTable({
          labelHead: "State",
          rows: sum.states,
          locations: true,
          totalLabel: "Grand Total",
          total: {
            gross: t.gross,
            sold: t.sold,
            shows: t.shows,
            locations: t.theatres,
            occupancy: t.occupancy,
          },
        }),
      );
    }
    if (key === "theatre") {
      if (!sum.theatres.length) return empty("No theatre-wise breakdown available.");
      const more = sum.theatres.length > GLOBAL_TOP_THEATRES;
      const rows = showAllTheatres ? sum.theatres : sum.theatres.slice(0, GLOBAL_TOP_THEATRES);
      return h(
        "div",
        { class: "perf-panel-body" },
        globalTable({ labelHead: "Theatre", rows, rank: true }),
        more
          ? h(
              "div",
              { class: "g-more" },
              h(
                "button",
                {
                  class: "btn ghost",
                  type: "button",
                  onclick: () => {
                    showAllTheatres = !showAllTheatres;
                    panel.replaceChildren(contentFor("theatre"));
                  },
                },
                showAllTheatres
                  ? "Show top " + GLOBAL_TOP_THEATRES
                  : "Show all " + usn(sum.theatres.length) + " theatres",
              ),
            )
          : null,
      );
    }
    const spec = {
      format: ["Format", sum.formats, "format"],
      language: ["Language", sum.languages, "language"],
      chain: ["Chain", sum.chains, "chain"],
    }[key];
    const [labelHead, rows] = spec;
    if (!rows.length) return empty("No " + key + "-wise breakdown available.");
    return h(
      "div",
      { class: "perf-panel-body" },
      globalTable({
        labelHead,
        rows,
        share: true,
        tag: key === "language",
        total: totalOf(rows),
      }),
    );
  };

  const panel = h("div", { class: "perf-panel-body" }, contentFor(active.id));
  const tabButtons = tabs.map((tb) =>
    h(
      "button",
      {
        class: "perf-tab" + (tb.id === active.id ? " active" : ""),
        type: "button",
        "data-key": tb.id,
        onclick: () => {
          active = tb;
          tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.key === tb.id));
          panel.replaceChildren(contentFor(tb.id));
        },
      },
      icon(tb.icon),
      h("span", null, tb.label),
    ),
  );

  return h(
    "section",
    { class: "perf-wrap" },
    h(
      "div",
      { class: "perf-head" },
      h("h3", { class: "perf-title" }, "Performance Breakdown"),
      h(
        "div",
        { class: "perf-actions" },
        h(
          "div",
          { class: "perf-status" },
          h("span", { class: "perf-status-text" }, "Updated : " + (tracked || "—")),
        ),
        dlBtn(
          () => active.label,
          "perf-download",
          // Full Report Card tab: hand back the pre-rendered PNG itself
          // (no hero / logo / wrapper card around it)
          () => (active.id === "report" && report && report.url ? { url: report.url } : null),
        ),
      ),
    ),
    h("div", { class: "perf-tabs" }, ...tabButtons),
    panel,
  );
}

// The collector's report image (publish_to_dashboard.py ->
// overseas/<date>/<slug>-report.png), shown as-is. Click opens full size.
function reportCardPanel(url) {
  const body = h("div", { class: "perf-panel-body g-report" });
  const missing = () =>
    body.replaceChildren(
      h(
        "div",
        { class: "perf-panel-body empty" },
        "Full report card isn't available for this date yet.",
      ),
    );
  if (!url) {
    missing();
    return body;
  }
  const img = h("img", {
    class: "g-report-img",
    src: url,
    alt: "Full report card",
    decoding: "async",
  });
  img.onerror = missing;
  body.append(
    h(
      "a",
      {
        class: "g-report-link",
        href: url,
        target: "_blank",
        rel: "noopener",
        title: "Open full size",
      },
      img,
    ),
  );
  return body;
}
