import { breakdownPanel, dayChips, flatCities } from "../../components/dateChips.js";
import { block } from "../../components/block.js";
import { dlBtn } from "../../components/dlBtn.js";
import { setIndiaGross } from "../../components/indiaGross.js";
import { milestones } from "../../components/milestones.js";
import { runShape } from "../../components/runShape.js";
import { stateMsg } from "../../components/states.js";
import { citiesPanel, citiesTable, formatGrid, languageGrid } from "../../components/tables.js";
import {
  dayNumber,
  isOpeningDate,
  isPremiereDate,
  openingDay,
  ymdShort,
} from "../../core/dates.js";
import { h, icon } from "../../core/dom.js";
import { fmtDate, fmtUpdated, inr, num, pct } from "../../core/format.js";
import { enc, go } from "../../core/router.js";
import { allIndiaContent } from "./allIndia.js";
import { cityDetails, stateDetails } from "./drilldowns.js";

/* ---- Advance / Daily tab ---- */
export function renderTrackTab(body, s, movie) {
  const { tab, date, dates, stateName, cityName, staleDate, hist } = s;
  const parts = [];

  // Live tracking: headline the running India gross up to this day
  // (kpi.indiaGross; older builds only have kpi.gross)
  if (tab === "daily" && movie && movie.kpi) {
    const last = [...dates].sort().pop();
    setIndiaGross(movie.kpi.indiaGross != null ? movie.kpi.indiaGross : movie.kpi.gross, {
      day: isPremiereDate(movie, date) ? "Premiere" : "Day " + dayNumber(date, dates, movie),
      running: date === last,
    });
  } else if (tab === "advance" && movie && movie.kpi) {
    // Advance: the running total of the advance snapshots up to this release
    // date (kpi.indiaGross). It is booking value, not box office - say so.
    setIndiaGross(movie.kpi.indiaGross != null ? movie.kpi.indiaGross : movie.kpi.gross, {
      label: "India advance gross",
      // how many advance days are in the running total
      day: (() => {
        const n = dates.filter((d) => d <= date).length || 1;
        return n + (n === 1 ? " day" : " days");
      })(),
    });
  } else setIndiaGross(null);

  // showing an older day because the newest one has no data for this movie yet
  if (staleDate && !stateName)
    parts.push(
      h(
        "div",
        { class: "stale-note" },
        icon("time-past"),
        h(
          "span",
          null,
          (tab === "daily" ? "Today" : fmtDate(staleDate)) +
            " hasn't been tracked yet — showing the last tracked day, " +
            fmtDate(date) +
            ".",
        ),
      ),
    );

  // ---- day / advance chips (Day 1 · 10 Jul · FRI) ----
  // An unreleased film with only ONE tracked date gets no chips: that single
  // date is its opening day and is already named in the panel header. Once
  // it has more than one date (opening day + later advance dates), the
  // chips come back so each date is reachable and individually labelled.
  if (dates.length > 1 || (dates.length === 1 && !openingDay(movie)))
    parts.push(dayChips(s, movie));

  // drill: city details
  if (stateName && cityName) {
    parts.push(cityDetails(s, movie));
    body.replaceChildren(...parts);
    return;
  }
  // drill: state details
  if (stateName) {
    parts.push(stateDetails(s, movie));
    body.replaceChildren(...parts);
    return;
  }

  // ---- main tab view: collapsible breakdown strip ----
  // banner layout: the strip lives in the hero (.mh-kpis); fall back to the
  // body if the slot isn't there
  const panel = breakdownPanel(s, movie);
  const slot = document.querySelector(".movie-hero .mh-kpis");
  if (slot) slot.replaceChildren(panel);
  else parts.push(panel);

  // Live tracking: India gross milestones (0 / 5 / 10 / 25 / 50 / 100 / 150 Cr)
  // sit right above the Performance Breakdown
  if (tab === "daily" && movie.kpi) {
    const ms = milestones(movie.kpi.indiaGross != null ? movie.kpi.indiaGross : movie.kpi.gross);
    if (ms) parts.push(ms);
  }

  parts.push(performanceBreakdown(s, movie));

  // Advance: gross per release date as bars (data/advance/history/<slug>.json,
  // days[].gross), after the breakdown, same look as the Historical run shape
  if (tab === "advance" && hist && Array.isArray(hist.days) && hist.days.length) {
    const days = hist.days
      .map((d) => ({ ymd: String(d.date || d.ymd || "").replace(/-/g, ""), gross: +d.gross || 0 }))
      .filter((d) => /^\d{8}$/.test(d.ymd))
      .sort((a, b) => a.ymd.localeCompare(b.ymd));
    if (days.length)
      parts.push(
        block(
          "Run Shape",
          "Advance gross by release date",
          runShape(
            days.map((d) => ({
              label: ymdShort(d.ymd),
              gross: d.gross,
              live: false,
            })),
            "release date",
          ),
        ),
      );
  }

  body.replaceChildren(...parts);
}

function performanceBreakdown(s, movie) {
  const { slug, tab, date } = s;
  const cities = flatCities(movie); // every city: searchable + paged in the City Wise panel
  const stateTotals = movie.states.reduce(
    (sum, st) => ({
      gross: sum.gross + (st.gross || 0),
      sold: sum.sold + (st.sold || 0),
      shows: sum.shows + (st.shows || 0),
      theatres: sum.theatres + (st.theatres || 0),
      seats: sum.seats + (st.seats || 0),
    }),
    { gross: 0, sold: 0, shows: 0, theatres: 0, seats: 0 },
  );
  const stateOccupancy = stateTotals.seats ? (stateTotals.sold / stateTotals.seats) * 100 : 0;
  const stateGrid = h(
    "div",
    { class: "table-wrap statewise-table" },
    h(
      "table",
      { class: "bo" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          ...["State", "Gross", "Tickets", "Shows", "Theatres", "Occupancy"].map((label, index) =>
            h("th", { class: index ? "num" : null }, label),
          ),
        ),
      ),
      h(
        "tbody",
        null,
        ...movie.states.map((st) =>
          h(
            "tr",
            {
              class: "clickable",
              tabindex: "0",
              onclick: () => go(`/movie/${enc(slug)}/${tab}/${date}/state/${enc(st.state)}`),
              onkeydown: (e) => {
                if (e.key === "Enter")
                  go(`/movie/${enc(slug)}/${tab}/${date}/state/${enc(st.state)}`);
              },
            },
            h("td", { class: "city-nm" }, st.state),
            h("td", { class: "num gold" }, inr(st.gross)),
            h("td", { class: "num" }, num(st.sold)),
            h("td", { class: "num" }, num(st.shows)),
            h("td", { class: "num" }, num(st.theatres)),
            h("td", { class: "num" }, pct(st.occupancy)),
          ),
        ),
        h(
          "tr",
          null,
          h("td", { class: "totcell" }, "Total"),
          h("td", { class: "num gold totcell" }, inr(stateTotals.gross)),
          h("td", { class: "num totcell" }, num(stateTotals.sold)),
          h("td", { class: "num totcell" }, num(stateTotals.shows)),
          h("td", { class: "num totcell" }, num(stateTotals.theatres)),
          h("td", { class: "num totcell" }, pct(stateOccupancy)),
        ),
      ),
    ),
  );

  const langGrid = languageGrid(movie.languageSummary);
  const perfTabs = [
    { id: "state", label: "State Wise", icon: "marker" },
    { id: "language", label: "Language Wise", icon: "language" },
    { id: "format", label: "Format Wise", icon: "film" },
    { id: "city", label: "City Wise", icon: "city" },
    { id: "allindia", label: "All India Report", icon: "globe" },
  ];
  let activePerfTab = perfTabs[3];

  const contentFor = (key) => {
    if (key === "allindia") {
      return movie.territory
        ? h("div", { class: "perf-panel-body allindia-panel" }, allIndiaContent(movie.territory))
        : h(
            "div",
            { class: "perf-panel-body empty" },
            stateMsg(
              "triangle-warning",
              "All India report not available",
              "Territory-wise tracking hasn't been published for this movie yet.",
            ),
          );
    }
    if (key === "language") {
      return langGrid
        ? h("div", { class: "perf-panel-body" }, langGrid)
        : h("div", { class: "perf-panel-body empty" }, "No language-wise breakdown available.");
    }
    if (key === "format") {
      return h("div", { class: "perf-panel-body" }, formatGrid(movie.formatSummary));
    }
    if (key === "city") {
      return h(
        "div",
        { class: "perf-panel-body" },
        citiesPanel(cities, slug, tab, date, { onPage: () => animateIn() }),
      );
    }
    return h("div", { class: "perf-panel-body" }, stateGrid);
  };

  const tabButtons = perfTabs.map((t) =>
    h(
      "button",
      {
        class: "perf-tab" + (t.id === "city" ? " active" : ""),
        type: "button",
        onclick: () => {
          activePerfTab = t;
          tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.key === t.id));
          // new table fades in and its rows cascade in one after another
          panel.replaceChildren(contentFor(t.id));
          animateIn();
        },
        "data-key": t.id,
      },
      icon(t.icon),
      h("span", null, t.label),
    ),
  );

  const panel = h("div", { class: "perf-panel-body" }, contentFor("city"));

  // Tab switch: the new table fades in and its rows cascade in one after the
  // other. The class is removed afterwards so nothing animated is left behind
  // (the PNG export must never catch rows mid-animation).
  let animTimer = 0;
  function animateIn() {
    panel.classList.remove("perf-enter");
    void panel.offsetWidth; // restart the animation
    panel
      .querySelectorAll("tbody tr")
      .forEach((tr, i) => tr.style.setProperty("--i", Math.min(i, 18)));
    panel.classList.add("perf-enter");
    clearTimeout(animTimer);
    animTimer = setTimeout(() => panel.classList.remove("perf-enter"), 1500);
  }
  animateIn();

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
          h(
            "span",
            { class: "perf-status-text" },
            "Updated : " + fmtUpdated(movie.last_updated || ""),
          ),
        ),
        dlBtn(() => activePerfTab.label, "perf-download"),
      ),
    ),
    h("div", { class: "perf-tabs" }, ...tabButtons),
    panel,
  );
}
