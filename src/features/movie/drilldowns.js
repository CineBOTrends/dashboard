import { block } from "../../components/block.js";
import { kpiCard, occMeter } from "../../components/kpi.js";
import { stateMsg, loading } from "../../components/states.js";
import { citiesTable, formatGrid } from "../../components/tables.js";
import { frag, h, icon } from "../../core/dom.js";
import { inr, num, pct } from "../../core/format.js";
import { Data } from "../../core/store.js";

/* ---- State details ---- */
export function stateDetails(s, movie) {
  const { slug, tab, date, stateName } = s;
  const st = movie.states.find((x) => x.state === stateName);
  if (!st)
    return stateMsg(
      "marker",
      "State not found",
      "It may not be tracked for this date.",
    );
  const cities = st.cityList.map((c) => ({ ...c, state: st.state }));
  return frag(
    h(
      "div",
      { class: "kpi-grid", style: "margin-top:4px" },
      kpiCard("Gross", inr(st.gross), st.state, "indian-rupee-sign", true),
      kpiCard("Tickets", num(st.sold), "sold", "ticket"),
      kpiCard(
        "Shows",
        num(st.shows),
        num(st.theatres) + " theatres",
        "clapperboard-play",
      ),
      kpiCard(
        "Occupancy",
        pct(st.occupancy),
        st.cities + " cities",
        "chart-pie",
      ),
    ),
    block(
      "Top Cities",
      "Tap a city for theatre-level detail",
      citiesTable(cities, slug, tab, date, true),
    ),
  );
}

/* ---- City details (theatres + show timings) ---- */
export function cityDetails(s, movie) {
  const { stateName, cityName } = s;
  const st = movie.states.find((x) => x.state === stateName);
  const ct = st && st.cityList.find((x) => x.city === cityName);
  if (!ct)
    return stateMsg(
      "building",
      "City not found",
      "It may not be tracked for this date.",
    );
  if (ct.theatreList) return cityBody(ct);

  // summary-first data: theatre rows live in a per-state chunk, loaded on demand
  const host = h("div", null, loading());
  Data.theatres(s.mode, s.date, s.slug, st.detail)
    .then((chunk) => {
      ct.theatreList = (chunk.cities && chunk.cities[ct.city]) || [];
      host.replaceChildren(cityBody(ct));
    })
    .catch(() =>
      host.replaceChildren(
        stateMsg(
          "triangle-warning",
          "Couldn't load theatres",
          "Try refreshing the page.",
        ),
      ),
    );
  return host;
}

function cityBody(ct) {
  const theatres = ct.theatreList.map((t) => theatreAccordion(t));
  // city-level format summary
  const fmtAcc = {};
  for (const t of ct.theatreList)
    for (const sh of t.showTimings) {
      const f =
        fmtAcc[sh.format] ||
        (fmtAcc[sh.format] = {
          format: sh.format,
          gross: 0,
          sold: 0,
          shows: 0,
          seats: 0,
        });
      f.gross += sh.estimatedCollection;
      f.sold += sh.sold;
      f.shows += 1;
      f.seats += sh.totalSeats;
    }
  const fmtList = Object.values(fmtAcc).map((f) => ({
    ...f,
    occupancy: f.seats ? (f.sold / f.seats) * 100 : 0,
  }));

  return frag(
    h(
      "div",
      { class: "kpi-grid", style: "margin-top:4px" },
      kpiCard("Theatres", num(ct.theatres), ct.city, "building"),
      kpiCard("Gross", inr(ct.gross), "booked", "indian-rupee-sign", true),
      kpiCard(
        "Tickets",
        num(ct.sold) + " / " + num(ct.seats),
        "sold / capacity",
        "ticket",
      ),
      kpiCard(
        "Occupancy",
        pct(ct.occupancy),
        num(ct.shows) + " shows",
        "chart-pie",
      ),
    ),
    block(
      "Theatres",
      "Tap a theatre to see show timings",
      h("div", null, ...theatres),
    ),
    block("Format Summary", "Within " + ct.city, formatGrid(fmtList)),
  );
}

function theatreAccordion(t) {
  const wrap = h("div", { class: "theatre" });
  const head = h(
    "div",
    {
      class: "th-head",
      onclick: () => wrap.classList.toggle("open"),
      role: "button",
      tabindex: "0",
      onkeydown: (e) => {
        if (e.key === "Enter") wrap.classList.toggle("open");
      },
    },
    h(
      "div",
      null,
      h("div", { class: "tname" }, t.venue),
      h(
        "div",
        { class: "tsub" },
        [t.chain, t.address].filter(Boolean).join(" · ").slice(0, 80),
      ),
    ),
    h(
      "div",
      { class: "tnums" },
      h(
        "div",
        null,
        h("div", { class: "k" }, "Shows"),
        h("div", { class: "v" }, num(t.shows)),
      ),
      h(
        "div",
        null,
        h("div", { class: "k" }, "Sold"),
        h("div", { class: "v" }, num(t.sold)),
      ),
      h(
        "div",
        null,
        h("div", { class: "k" }, "Gross"),
        h("div", { class: "v gold" }, inr(t.gross)),
      ),
      h(
        "div",
        null,
        h("div", { class: "k" }, "Occ"),
        h("div", { class: "v" }, pct(t.occupancy)),
      ),
    ),
    icon("angle-right", "caret"),
  );

  const rows = t.showTimings.map((sh) =>
    h(
      "tr",
      null,
      h("td", { class: "mono" }, sh.time || "—"),
      h("td", null, sh.audi || "—"),
      h("td", null, h("span", { class: "tag" }, sh.format)),
      h("td", { class: "num" }, num(sh.totalSeats)),
      h("td", { class: "num" }, num(sh.sold)),
      h("td", { class: "num" }, num(sh.available)),
      h("td", null, occMeter(sh.occupancy)),
      h("td", { class: "num gold" }, inr(sh.estimatedCollection)),
      h("td", { class: "num" }, inr(sh.maxGross)),
      h(
        "td",
        null,
        sh.housefull
          ? h("span", { class: "pill hf" }, "Houseful")
          : sh.fastfilling
            ? h("span", { class: "pill ff" }, "Fast")
            : h("span", { class: "muted" }, "—"),
      ),
    ),
  );
  const tableBody = h(
    "div",
    { class: "th-body" },
    h(
      "table",
      { class: "bo" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Time"),
          h("th", null, "Screen"),
          h("th", null, "Format"),
          h("th", { class: "num" }, "Seats"),
          h("th", { class: "num" }, "Sold"),
          h("th", { class: "num" }, "Avail"),
          h("th", null, "Occupancy"),
          h("th", { class: "num" }, "Est. Coll."),
          h("th", { class: "num" }, "Max Gross"),
          h("th", null, "Status"),
        ),
      ),
      h("tbody", null, ...rows),
    ),
  );

  wrap.append(head, tableBody);
  return wrap;
}
