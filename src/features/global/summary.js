import { h } from "../../core/dom.js";
import { pct } from "../../core/format.js";
import { usd, usn } from "../home/globalStrip.js";
import { _num, _pick } from "../home/overseas.js";

// Raw collector summary -> uniform rows. Every list is optional.
export function normalizeGlobalSummary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const list = (k) => (Array.isArray(raw[k]) ? raw[k] : []);
  const row = (o, nameKeys) => {
    const sold = _num(_pick(o, ["ticketsSold", "admissions"], 0));
    const seats = _num(o.totalTickets);
    return {
      name: _pick(o, nameKeys, "—"),
      gross: _num(o.gross),
      sold,
      shows: _num(o.shows),
      locations: _num(o.theatres),
      occupancy:
        o.occupancy != null
          ? _num(o.occupancy)
          : seats
            ? (sold / seats) * 100
            : 0,
      seats,
    };
  };
  const byGross = (a, b) => b.gross - a.gross;
  const states = list("territories")
    .map((o) => row(o, ["territory"]))
    .sort(byGross);
  const theatres = list("highestGrossingTheatres")
    .map((o) => row(o, ["theatre"]))
    .sort(byGross);
  const formats = list("formatBreakdown")
    .map((o) => row(o, ["format"]))
    .sort(byGross);
  const languages = list("languageBreakdown")
    .map((o) => row(o, ["language"]))
    .sort(byGross);
  const chains = list("chainBreakdown")
    .map((o) => row(o, ["chain"]))
    .sort(byGross);

  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  // formats partition the shows, so their capacities add up to the total
  const seats = sum(formats, "seats") || sum(languages, "seats");
  const sold = _num(raw.admissions) || sum(states, "sold");
  return {
    title: raw.title || "",
    trackedAt: raw.trackedAt || "",
    total: {
      gross: _num(raw.gross) || sum(states, "gross"),
      sold,
      seats,
      shows: _num(raw.shows) || sum(states, "shows"),
      theatres: _num(raw.theatres) || sum(states, "locations"),
      cities: _num(raw.cities),
      occupancy:
        raw.occupancy != null
          ? _num(raw.occupancy)
          : seats
            ? (sold / seats) * 100
            : 0,
    },
    states,
    theatres,
    formats,
    languages,
    chains,
  };
}

// One table builder for all five tabs (same markup/classes as the India
// breakdown tables, so theme + mobile rules apply unchanged).
export function globalTable(o) {
  const { labelHead, rows, total, totalLabel, share, locations, rank, tag } =
    o;
  const rowsGross = rows.reduce((a, r) => a + r.gross, 0);
  const heads = [
    rank ? "#" : null,
    labelHead,
    "Gross",
    share ? "%" : null,
    locations ? "Locations" : null,
    "Tickets Sold",
    "Shows",
    "Occupancy",
  ].filter(Boolean);
  const isNum = (t, i) => (rank ? i > 1 : i > 0) && t !== "#";
  const body = rows.map((r, i) =>
    h(
      "tr",
      null,
      rank ? h("td", { class: "rank" + (i < 3 ? " top" : "") }, i + 1) : null,
      h(
        "td",
        { class: "city-nm" },
        tag ? h("span", { class: "tag lang" }, r.name) : r.name,
      ),
      h("td", { class: "num gold" }, usd(r.gross)),
      share
        ? h(
            "td",
            { class: "num" },
            rowsGross ? ((r.gross / rowsGross) * 100).toFixed(1) + "%" : "—",
          )
        : null,
      locations ? h("td", { class: "num" }, usn(r.locations)) : null,
      h("td", { class: "num" }, usn(r.sold)),
      h("td", { class: "num" }, usn(r.shows)),
      h("td", { class: "num" }, pct(r.occupancy)),
    ),
  );
  if (total)
    body.push(
      h(
        "tr",
        null,
        rank ? h("td", { class: "totcell" }) : null,
        h("td", { class: "totcell" }, totalLabel || "Total"),
        h("td", { class: "num gold totcell" }, usd(total.gross)),
        share ? h("td", { class: "num totcell" }, "100.0%") : null,
        locations
          ? h("td", { class: "num totcell" }, usn(total.locations))
          : null,
        h("td", { class: "num totcell" }, usn(total.sold)),
        h("td", { class: "num totcell" }, usn(total.shows)),
        h("td", { class: "num totcell" }, pct(total.occupancy)),
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
          ...heads.map((t, i) =>
            h("th", { class: isNum(t, i) ? "num" : null }, t),
          ),
        ),
      ),
      h("tbody", null, ...body),
    ),
  );
}

export const GLOBAL_TOP_THEATRES = 20;
