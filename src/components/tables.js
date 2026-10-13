import { occMeter } from "./kpi.js";
import { h, icon } from "../core/dom.js";
import { FORMAT_ORDER } from "../core/feeds.js";
import { inr, num } from "../core/format.js";
import { enc, go } from "../core/router.js";

// one city row; `rank` is its position in the FULL gross ranking
function cityRow(ct, rank, slug, tab, date, showState) {
  return h(
    "tr",
    {
      class: "clickable",
      onclick: () =>
        go(`/movie/${enc(slug)}/${tab}/${date}/state/${enc(ct.state)}/city/${enc(ct.city)}`),
    },
    h("td", { class: "rank" + (rank <= 3 ? " top" : "") }, rank),
    h(
      "td",
      null,
      h("div", { class: "city-nm" }, ct.city),
      // state sits under the city name, not in its own column
      showState !== false ? h("div", { class: "sub" }, ct.state) : null,
    ),
    h("td", { class: "gross-cell gold" }, inr(ct.gross)),
    h("td", { class: "num" }, num(ct.shows)),
    h("td", { class: "occ-cell" }, occMeter(ct.occupancy)),
    h("td", { class: "num" }, num(ct.sold)),
  );
}

const citiesHead = () =>
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
  );

export function citiesTable(cities, slug, tab, date, showState) {
  const rows = cities.map((ct, i) => cityRow(ct, i + 1, slug, tab, date, showState));
  return h(
    "div",
    { class: "table-wrap" },
    h("table", { class: "bo cities" }, citiesHead(), h("tbody", null, ...rows)),
  );
}

/* City Wise panel: ALL cities (not just the top 20), with a search box and
   25-per-page paging ("1-25 of 526 cities", "Page 1 of 22"). Ranks stay the
   city's position in the full gross ranking, so searching "Hyderabad" still
   shows it as #7. `onPage` runs after a page change (row animation). */
export function citiesPanel(all, slug, tab, date, { pageSize = 25, onPage } = {}) {
  const ranked = all.map((c, i) => ({ ...c, _rank: i + 1 }));
  const st = { q: "", page: 1 };

  const chevron = (d) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const prev = h("button", {
    class: "pager-btn",
    type: "button",
    "aria-label": "Previous page",
    html: chevron("M15 18l-6-6 6-6"),
    onclick: () => go_(st.page - 1),
  });
  const next = h("button", {
    class: "pager-btn",
    type: "button",
    "aria-label": "Next page",
    html: chevron("M9 6l6 6-6 6"),
    onclick: () => go_(st.page + 1),
  });
  const info = h("div", { class: "pager-info" });
  const pageLbl = h("span", { class: "pager-page" });
  const tbody = h("tbody", null);

  const search = h("input", {
    type: "search",
    placeholder: "Search city or state",
    "aria-label": "Search cities",
    autocomplete: "off",
    oninput: (e) => {
      st.q = e.target.value;
      st.page = 1;
      paint(false);
    },
  });

  const filtered = () => {
    const q = st.q.trim().toLowerCase();
    return q
      ? ranked.filter(
          (c) =>
            c.city.toLowerCase().includes(q) ||
            String(c.state || "")
              .toLowerCase()
              .includes(q),
        )
      : ranked;
  };

  function go_(p) {
    const pages = Math.max(1, Math.ceil(filtered().length / pageSize));
    st.page = Math.min(Math.max(1, p), pages);
    paint(true);
  }

  function paint(animate) {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    st.page = Math.min(st.page, pages);
    const start = (st.page - 1) * pageSize;
    const slice = list.slice(start, start + pageSize);
    if (slice.length)
      tbody.replaceChildren(...slice.map((ct) => cityRow(ct, ct._rank, slug, tab, date)));
    else
      tbody.replaceChildren(
        h(
          "tr",
          null,
          h("td", { colspan: "6", class: "city-empty" }, "No cities match your search."),
        ),
      );
    info.textContent = list.length
      ? `${start + 1}\u2013${start + slice.length} of ${num(list.length)} cities`
      : "0 cities";
    pageLbl.textContent = `Page ${st.page} of ${pages}`;
    prev.disabled = st.page <= 1;
    next.disabled = st.page >= pages;
    if (animate && onPage) onPage();
  }

  const root = h(
    "div",
    { class: "cities-panel" },
    h(
      "div",
      { class: "cities-tools" },
      h("label", { class: "city-search" }, icon("search"), search),
    ),
    h("div", { class: "table-wrap" }, h("table", { class: "bo cities" }, citiesHead(), tbody)),
    h("div", { class: "pager" }, info, h("div", { class: "pager-ctl" }, prev, pageLbl, next)),
  );
  paint(false);
  return root;
}

// Language-wise collections. The collector has always emitted
// movie.languageSummary alongside formatSummary — it just was never shown.
// Same shape as formatGrid, plus a share-of-gross % column, since "which
// language is actually driving this" is the thing people read it for.
export function languageGrid(langs) {
  if (!langs || !langs.length) return null;

  const totals = langs.reduce(
    (sum, l) => ({
      gross: sum.gross + (l.gross || 0),
      sold: sum.sold + (l.sold || 0),
      seats: sum.seats + (l.seats || 0),
      shows: sum.shows + (l.shows || 0),
    }),
    { gross: 0, sold: 0, seats: 0, shows: 0 },
  );
  const total = totals.gross;
  const totalOccupancy = totals.seats ? (totals.sold / totals.seats) * 100 : 0;
  const ordered = langs.slice().sort((a, b) => b.gross - a.gross);

  const rows = ordered.map((l) =>
    h(
      "tr",
      null,
      h("td", null, h("span", { class: "tag lang" }, l.language)),
      h("td", { class: "num gold" }, inr(l.gross)),
      h(
        "td",
        { class: "num" },
        h("span", { class: "share" }, total ? ((l.gross / total) * 100).toFixed(1) + "%" : "—"),
      ),
      h("td", { class: "num" }, num(l.sold)),
      h("td", { class: "num" }, num(l.shows)),
      h("td", null, occMeter(l.occupancy)),
    ),
  );

  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "bo langwise" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Language"),
          h("th", { class: "num" }, "Gross"),
          h("th", { class: "num" }, "%"),
          h("th", { class: "num" }, "Tickets"),
          h("th", { class: "num" }, "Shows"),
          h("th", null, "Occupancy"),
        ),
      ),
      h(
        "tbody",
        null,
        ...rows,
        h(
          "tr",
          null,
          h("td", { class: "totcell" }, "Total"),
          h("td", { class: "num gold totcell" }, inr(totals.gross)),
          h("td", { class: "num totcell" }, "100.0%"),
          h("td", { class: "num totcell" }, num(totals.sold)),
          h("td", { class: "num totcell" }, num(totals.shows)),
          h("td", { class: "totcell" }, occMeter(totalOccupancy)),
        ),
      ),
    ),
  );
}

export function formatGrid(fmts) {
  const totals = fmts.reduce(
    (sum, f) => ({
      gross: sum.gross + (f.gross || 0),
      sold: sum.sold + (f.sold || 0),
      seats: sum.seats + (f.seats || 0),
      shows: sum.shows + (f.shows || 0),
    }),
    { gross: 0, sold: 0, seats: 0, shows: 0 },
  );
  const totalOccupancy = totals.seats ? (totals.sold / totals.seats) * 100 : 0;
  const ordered = fmts
    .slice()
    .sort(
      (a, b) =>
        FORMAT_ORDER.indexOf(a.format) +
        99 * (FORMAT_ORDER.indexOf(a.format) < 0) -
        (FORMAT_ORDER.indexOf(b.format) + 99 * (FORMAT_ORDER.indexOf(b.format) < 0)),
    );
  const rows = ordered.map((f) =>
    h(
      "tr",
      null,
      h("td", null, h("span", { class: "tag" }, f.format)),
      h("td", { class: "num gold" }, inr(f.gross)),
      h("td", { class: "num" }, num(f.sold)),
      h("td", { class: "num" }, num(f.shows)),
      h("td", null, occMeter(f.occupancy)),
    ),
  );
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "bo" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Format"),
          h("th", { class: "num" }, "Gross"),
          h("th", { class: "num" }, "Tickets"),
          h("th", { class: "num" }, "Shows"),
          h("th", null, "Occupancy"),
        ),
      ),
      h(
        "tbody",
        null,
        ...rows,
        h(
          "tr",
          null,
          h("td", { class: "totcell" }, "Total"),
          h("td", { class: "num gold totcell" }, inr(totals.gross)),
          h("td", { class: "num totcell" }, num(totals.sold)),
          h("td", { class: "num totcell" }, num(totals.shows)),
          h("td", { class: "totcell" }, occMeter(totalOccupancy)),
        ),
      ),
    ),
  );
}

/* ---- All India Report (territory-wise) ----------------------------
   Reads movie.territory — a per-movie {totals, territories[], groups[]}
   breakdown embedded directly in this movie's own m/<slug>.json by
   build_data.py (computed with territory_report.py's own aggregation
   logic, just scoped to this movie's rows instead of every tracked
   movie). Rendered synchronously alongside the State/Language/Format/
   City tabs, which are all movie-scoped the same way — no separate
   fetch needed, unlike the old global territory_tracked.json version.
   Each territory can carry a nested "states" breakup (currently only
   Rest of India) and a "movies" breakup (version/format/language split
   for that territory). "groups" roll a run of territories (or,
   chained, other groups) up into a subtotal:
     - a group with "children" (e.g. Nizam, nesting Hyderabad) replaces
       its raw-territory members inline — its own row appears where the
       first of those territories would have, immediately followed by
       its children as indented sub-rows, with every other member (e.g.
       Nizam Districts) folded in silently;
     - a group without "children" (e.g. APTG Total, Karnataka Total)
       keeps the older behaviour: a bold subtotal row appended right
       after the last territory/group in its "members" list.
   A group's optional "note" renders as a small italic line above the
   table (e.g. the AP/Telangana sub-region disclaimer). */
