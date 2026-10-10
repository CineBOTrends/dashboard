import { breakdownPanel, dayChips, flatCities } from "../../components/dateChips.js";
import { dlBtn } from "../../components/dlBtn.js";
import { stateMsg } from "../../components/states.js";
import { citiesTable, formatGrid, languageGrid } from "../../components/tables.js";
import { openingDay } from "../../core/dates.js";
import { h, icon } from "../../core/dom.js";
import { fmtDate, fmtUpdated, inr, num, pct } from "../../core/format.js";
import { enc, go } from "../../core/router.js";
import { allIndiaContent } from "./allIndia.js";
import { cityDetails, stateDetails } from "./drilldowns.js";

/* ---- Advance / Daily tab ---- */
export function renderTrackTab(body, s, movie) {
  const { tab, date, dates, stateName, cityName, staleDate } = s;
  const parts = [];

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
  parts.push(breakdownPanel(s, movie));

  parts.push(performanceBreakdown(s, movie));

  body.replaceChildren(...parts);
}

function performanceBreakdown(s, movie) {
  const { slug, tab, date } = s;
  const cities = flatCities(movie).slice(0, 20);
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
  const stateOccupancy = stateTotals.seats
    ? (stateTotals.sold / stateTotals.seats) * 100
    : 0;
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
          ...[
            "State",
            "Gross",
            "Tickets",
            "Shows",
            "Theatres",
            "Occupancy",
          ].map((label, index) =>
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
              onclick: () =>
                go(
                  `/movie/${enc(slug)}/${tab}/${date}/state/${enc(st.state)}`,
                ),
              onkeydown: (e) => {
                if (e.key === "Enter")
                  go(
                    `/movie/${enc(slug)}/${tab}/${date}/state/${enc(st.state)}`,
                  );
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
        ? h(
            "div",
            { class: "perf-panel-body allindia-panel" },
            allIndiaContent(movie.territory),
          )
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
        : h(
            "div",
            { class: "perf-panel-body empty" },
            "No language-wise breakdown available.",
          );
    }
    if (key === "format") {
      return h(
        "div",
        { class: "perf-panel-body" },
        formatGrid(movie.formatSummary),
      );
    }
    if (key === "city") {
      return h(
        "div",
        { class: "perf-panel-body" },
        citiesTable(cities, slug, tab, date),
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
          tabButtons.forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.key === t.id),
          );
          panel.replaceChildren(contentFor(t.id));
        },
        "data-key": t.id,
      },
      icon(t.icon),
      h("span", null, t.label),
    ),
  );

  const panel = h("div", { class: "perf-panel-body" }, contentFor("city"));

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
