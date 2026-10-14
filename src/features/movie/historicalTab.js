import { block } from "../../components/block.js";
import { setIndiaGross } from "../../components/indiaGross.js";
import { runShape } from "../../components/runShape.js";
import { bdMetric } from "../../components/dateChips.js";
import { dlBtn } from "../../components/dlBtn.js";
import { occMeter } from "../../components/kpi.js";
import { stateMsg } from "../../components/states.js";
import { releaseYMD, todayYMD, ymdToDate } from "../../core/dates.js";
import { frag, h, icon } from "../../core/dom.js";
import { DL } from "../../core/exportState.js";
import { fmtDate, inr, num, pct } from "../../core/format.js";

/* ---- Historical tab ---- */
/* ---- historical: cumulative tracked totals ------------------------ */
const dYMD = (d) => String(d.date || "").replace(/-/g, "");
// A day counts only once it has ended. Trust the builder's flag when present,
// fall back to a date compare so this still works on pre-existing history.
const isDone = (d) => (typeof d.complete === "boolean" ? d.complete : dYMD(d) < todayYMD());
const tc = (v) => h("span", { class: "totcell" }, v);

// "Sat" from 20260711 / 2026-07-11
const dow = (raw) => {
  const y = String(raw).replace(/-/g, "");
  if (!/^\d{8}$/.test(y)) return "—";
  return ymdToDate(y).toLocaleDateString("en-IN", { weekday: "short" });
};

// Day-over-day gross movement. No previous day -> em dash, not a fake 0%.
function changeCell(cur, prev) {
  if (!prev) return h("span", { class: "chg flat" }, "—");
  const p = ((cur - prev) / prev) * 100;
  const up = p >= 0;
  return h(
    "span",
    { class: "chg " + (up ? "up" : "dn") },
    (up ? "▲ +" : "▼ ") + p.toFixed(1) + "%",
  );
}

function relabelHistDays(hist, movie) {
  const rel = releaseYMD(movie) || releaseYMD({ releaseDate: hist && hist.releaseDate });
  if (!hist || !hist.days || !rel) return hist;
  const days = hist.days.map((d) => {
    const y = dYMD(d);
    if (!/^\d{8}$/.test(y)) return d;
    const diff = Math.round((ymdToDate(y) - ymdToDate(rel)) / 86400000);
    return Object.assign(
      {},
      d,
      diff < 0 ? { day: 0, premiere: true } : { day: diff + 1, premiere: false },
    );
  });
  return Object.assign({}, hist, { days });
}
const histDayTag = (d) => (d.premiere ? "Premiere" : "Day " + d.day);

function histTotals(hist) {
  const days = (hist && hist.days) || [];
  const done = days.filter(isDone);
  const t = {
    days: done.length,
    gross: 0,
    sold: 0,
    seats: 0,
    shows: 0,
    housefull: 0,
    fastfilling: 0,
    theatres: 0,
    cities: 0,
    live: days.find((d) => !isDone(d)) || null,
    best: null,
  };
  done.forEach((d) => {
    t.gross += +d.gross || 0;
    t.sold += +d.sold || 0;
    t.seats += +d.seats || 0;
    t.shows += +d.shows || 0;
    t.housefull += +d.housefull || 0;
    t.fastfilling += +d.fastfilling || 0;
    t.theatres = Math.max(t.theatres, +d.theatres || 0); // footprint, not a sum
    t.cities = Math.max(t.cities, +d.cities || 0);
    if (!t.best || (+d.gross || 0) > (+t.best.gross || 0)) t.best = d;
  });
  // Weighted when we have seats; otherwise fall back to the mean of the days.
  t.occupancy = t.seats
    ? (t.sold / t.seats) * 100
    : done.length
      ? done.reduce((a, d) => a + (+d.occupancy || 0), 0) / done.length
      : 0;
  return t;
}

function totalTrackedPanel(t, label = "Total Tracked") {
  if (!t.days)
    return stateMsg(
      "time-past",
      "No completed days yet",
      t.live
        ? histDayTag(t.live) + " is still running. Totals appear once the day closes."
        : "Totals appear once the first tracked day finishes.",
    );

  const strip = h(
    "div",
    { class: "bd-strip" },
    bdMetric(
      label === "Total Tracked" ? "Total Gross" : "Gross",
      inr(t.gross),
      t.days + (t.days === 1 ? " day" : " days"),
      true,
    ),
    bdMetric("Tickets", num(t.sold), t.seats ? num(t.seats) + " seats" : null),
    bdMetric("Shows", num(t.shows)),
    t.theatres ? bdMetric("Theatres", num(t.theatres), "peak") : null,
    t.cities ? bdMetric("Cities", num(t.cities), "peak") : null,
    bdMetric("Occupancy", pct(t.occupancy), t.seats ? "weighted" : "day avg"),
    t.best ? bdMetric("Best Day", histDayTag(t.best), fmtDate(t.best.date)) : null,
    t.housefull ? bdMetric("Housefull", num(t.housefull), "shows", true) : null,
  );

  return h(
    "section",
    { class: "bd-panel hist" },
    dlBtn(label, "on-head"),
    h(
      "div",
      { class: "bd-head static" },
      icon("chart-histogram"),
      h("span", { class: "bd-title" }, label + " · " + t.days + (t.days === 1 ? " Day" : " Days")),
    ),
    h(
      "div",
      { class: "bd-body" },
      strip,
      t.live
        ? h(
            "div",
            { class: "bd-updated" },
            histDayTag(t.live) +
              " (" +
              fmtDate(t.live.date) +
              ") is still running — excluded until it closes.",
          )
        : null,
    ),
  );
}

// Mirrors citiesTable() (# / city + state beneath / gross / shows / occ / sold)
// but static — history rows have no single date to drill into.
function histCitiesTable(cities) {
  const rows = (cities || []).map((c, i) =>
    h(
      "tr",
      null,
      h("td", { class: "rank" + (i < 3 ? " top" : "") }, i + 1),
      h(
        "td",
        null,
        h("div", { class: "city-nm" }, c.city),
        c.state ? h("div", { class: "sub" }, c.state) : null,
      ),
      h("td", { class: "gross-cell gold" }, inr(c.gross)),
      h("td", { class: "num" }, num(c.shows)),
      h("td", { class: "occ-cell" }, occMeter(c.occupancy)),
      h("td", { class: "num" }, num(c.sold)),
    ),
  );
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "bo cities" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "#"),
          h("th", null, "City"),
          h("th", { class: "gross-cell" }, "Gross"),
          h("th", { class: "num" }, "Shows"),
          h("th", { class: "occ-cell" }, "Occupancy"),
          h("th", { class: "num" }, "Sold"),
        ),
      ),
      h("tbody", null, ...rows),
    ),
  );
}

// Range filter: Latest / Opening weekend / Week 1 / Week 2 / All days
const RANGES = [
  ["latest", "Latest"],
  ["weekend", "Opening weekend"],
  ["week1", "Week 1"],
  ["week2", "Week 2"],
  ["all", "All days"],
];

export function renderHistorical(body, hist, title, movie) {
  if (!hist)
    return body.replaceChildren(
      stateMsg(
        "time-past",
        "No history yet",
        "Historical tables build up as the collector runs across multiple days.",
      ),
    );
  // Re-number days from the release date (release day = Day 1) and flag
  // pre-release dates as Premiere, instead of trusting the builder's
  // position-in-list numbering.
  hist = relabelHistDays(hist, movie);

  const asc = hist.days.slice().sort((a, b) => dYMD(a).localeCompare(dYMD(b)));
  const prevGross = new Map();
  asc.forEach((d, i) => {
    if (i) prevGross.set(dYMD(d), +asc[i - 1].gross || 0);
  });

  // India gross (running total up to that day): the file's indiaGross (old
  // name cumulativeGross); older files without either get a running sum.
  let run = 0;
  const cum = new Map();
  asc.forEach((d) => {
    run += +d.gross || 0;
    cum.set(
      dYMD(d),
      d.indiaGross != null ? +d.indiaGross : d.cumulativeGross != null ? +d.cumulativeGross : run,
    );
  });

  // Opening weekend: release day up to the first Sunday (Thu release = 4 days,
  // Fri = 3, Sat = 2, Sun = 1); a Mon-Wed release counts its first 3 days.
  const d1 = asc.find((d) => !d.premiere && d.day === 1);
  let wkLen = 3;
  if (d1) {
    const wd = ymdToDate(dYMD(d1)).getDay(); // 0 = Sunday
    const len = ((7 - wd) % 7) + 1;
    wkLen = len <= 4 ? len : 3;
  }
  const real = (d) => !d.premiere && d.day >= 1;
  const closed = asc.filter(isDone);
  const pick = {
    // newest closed day (today's live day only if nothing has closed yet)
    latest: () => (closed.length ? closed.slice(-1) : asc.slice(-1)),
    weekend: () => asc.filter((d) => real(d) && d.day <= wkLen),
    week1: () => asc.filter((d) => real(d) && d.day <= 7),
    week2: () => asc.filter((d) => real(d) && d.day >= 8 && d.day <= 14),
    all: () => asc,
  };
  let range = "all";

  // blocks that always describe the whole run (cumulative / snapshot)
  const tAll = histTotals(hist);
  const scope = hist.cumulative
    ? "Cumulative across " + tAll.days + (tAll.days === 1 ? " day" : " days")
    : "Live snapshot" + (tAll.live ? " · " + histDayTag(tAll.live) + " in progress" : "");
  const staticBlocks = [
    block("City-wise Performance", scope + " · top cities by gross", histCitiesTable(hist.cities)),
    block(
      "State-wise Performance",
      scope + " · all states",
      simpleTable(
        ["State", "Gross", "Tickets", "Shows", "Theatres", "Occupancy"],
        hist.states.map((s) => [
          s.state,
          inr(s.gross),
          num(s.sold),
          num(s.shows),
          num(s.theatres),
          occMeter(s.occupancy),
        ]),
        [0, 1, 1, 1, 1, 2],
      ),
    ),
    block(
      "Format-wise Performance",
      scope + " · by presentation format",
      simpleTable(
        ["Format", "Gross", "Tickets", "Shows", "Occupancy"],
        hist.formats.map((f) => [
          f.format,
          inr(f.gross),
          num(f.sold),
          num(f.shows),
          occMeter(f.occupancy),
        ]),
        [0, 1, 1, 1, 2],
      ),
    ),
  ];

  const bar = h(
    "div",
    { class: "range-seg", role: "tablist", "aria-label": "Range" },
    ...RANGES.map(([k, label]) =>
      h(
        "button",
        {
          type: "button",
          class: "range-pill" + (k === range ? " active" : ""),
          "data-k": k,
          disabled: pick[k]().length === 0,
          onclick: () => {
            range = k;
            paint();
          },
        },
        label,
      ),
    ),
  );

  function paint() {
    bar
      .querySelectorAll(".range-pill")
      .forEach((b) => b.classList.toggle("active", b.dataset.k === range));
    const label = RANGES.find(([k]) => k === range)[1];
    const sel = pick[range]();
    const t = histTotals({ days: sel });

    DL.meta = Object.assign({}, DL.meta, {
      ctxLabel:
        "Historical · " +
        (range === "all" ? "" : label + " · ") +
        t.days +
        (t.days === 1 ? " Day" : " Days"),
      date: null,
      updated: hist.last_updated || (DL.meta && DL.meta.updated) || "",
      kpi: t.days ? { gross: t.gross, sold: t.sold, shows: t.shows } : null,
    });

    // hero headline: India gross at the LAST day of the chosen range
    const last = sel[sel.length - 1];
    if (last)
      setIndiaGross(cum.get(dYMD(last)), {
        day: last.premiere ? "Premiere" : "Day " + (last.day || asc.length),
        running: !isDone(last),
      });
    else setIndiaGross(null);

    const parts = [];
    if (hist.last_updated)
      parts.push(h("div", { class: "updated" }, icon("time-past"), "Updated " + hist.last_updated));
    parts.push(bar);

    if (!sel.length) {
      parts.push(
        stateMsg(
          "time-past",
          "No days in this range yet",
          "Pick another range to see tracked days.",
        ),
      );
    } else {
      // Cumulative (or range) total across the CLOSED days in the range
      parts.push(totalTrackedPanel(t, range === "all" ? "Total Tracked" : label));

      // Day-wise: TOTAL pinned at the bottom, newest day first, day-over-day
      // change on gross (against the day before, even across the range edge)
      const dayRows = [];
      sel
        .slice()
        .reverse()
        .forEach((d) =>
          dayRows.push([
            isDone(d)
              ? histDayTag(d)
              : frag(histDayTag(d), h("span", { class: "livetag" }, "LIVE")),
            fmtDate(d.date),
            dow(d.date),
            inr(d.gross),
            changeCell(+d.gross || 0, prevGross.get(dYMD(d))),
            num(d.sold),
            num(d.shows),
            occMeter(d.occupancy),
          ]),
        );
      if (t.days)
        dayRows.push([
          tc("TOTAL"),
          tc(t.days + (t.days === 1 ? " day" : " days")),
          tc("—"),
          tc(inr(t.gross)),
          tc("—"),
          tc(num(t.sold)),
          tc(num(t.shows)),
          tc(pct(t.occupancy)),
        ]);
      parts.push(
        block(
          "Day-wise Performance",
          t.days +
            " day(s) counted" +
            (t.live ? " · " + histDayTag(t.live) + " still running" : ""),
          simpleTable(
            ["Day", "Date", "Weekday", "Gross", "Change", "Tickets", "Shows", "Occupancy"],
            dayRows,
            [0, 0, 0, 1, 1, 1, 1, 2],
          ),
        ),
      );

      // Run shape: gross per day as bars, right under the day-wise table
      parts.push(
        block(
          "Run Shape",
          "Gross by day",
          runShape(
            sel.map((d, i) => ({
              label: d.premiere ? "P" : "D" + (d.day || i + 1),
              gross: +d.gross || 0,
              live: !isDone(d),
            })),
          ),
        ),
      );
    }

    parts.push(...staticBlocks);
    body.replaceChildren(...parts);
  }

  paint();
}

// align: 0=left, 1=right-num, 2=plain(node)
function simpleTable(heads, rows, align) {
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "bo" },
      h(
        "thead",
        null,
        h("tr", null, ...heads.map((hd, i) => h("th", { class: align[i] === 1 ? "num" : "" }, hd))),
      ),
      h(
        "tbody",
        null,
        ...(rows.length
          ? rows.map((r) =>
              h(
                "tr",
                null,
                ...r.map((cell, i) =>
                  h(
                    "td",
                    {
                      class:
                        align[i] === 1 ? "num mono" : i === 2 && align[i] === 1 ? "num gold" : "",
                    },
                    cell,
                  ),
                ),
              ),
            )
          : [
              h(
                "tr",
                null,
                h(
                  "td",
                  {
                    colspan: heads.length,
                    class: "muted",
                    style: "text-align:center;padding:30px",
                  },
                  "No data",
                ),
              ),
            ]),
      ),
    ),
  );
}
