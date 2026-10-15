import { h } from "../core/dom.js";
import { inr } from "../core/format.js";
import { block } from "./block.js";
import { ymdShort } from "../core/dates.js";

/* Run shape: one bar per tracked day (D1, D2, ...), height = that day's gross.
   `days`: [{ label, gross, live }] oldest -> newest. Heights are explicit px
   (not %), so the PNG export renders the same on every browser. */
const MAX_H = 150;

export function runShape(days, unit = "day") {
  const max = Math.max(1, ...days.map((d) => +d.gross || 0));
  const cols = days.map((d, i) => {
    const g = +d.gross || 0;
    const px = Math.max(2, Math.round((g / max) * MAX_H));
    return h(
      "div",
      { class: "rs-col", style: `--i:${i}`, title: `${d.label} · ${inr(g)}` },
      h("div", { class: "rs-val" }, inr(g)),
      h(
        "div",
        { class: "rs-well", style: `height:${MAX_H}px` },
        h("div", { class: "rs-bar" + (d.live ? " live" : ""), style: `height:${px}px` }),
      ),
      h("div", { class: "rs-lbl" }, d.label, d.live ? h("i", { class: "rs-live" }, "LIVE") : null),
    );
  });
  return h(
    "div",
    { class: "run-shape" },
    h("div", { class: "rs-bars" }, ...cols),
    h(
      "div",
      { class: "rs-cap" },
      `Run shape · all ${days.length} ${unit}${days.length === 1 ? "" : "s"}`,
    ),
  );
}

/* ---- Separate run shapes: Daily / Historical / Advance ----------------
   Each mode has its own title, caption and download name, and reads its own
   feed (data/daily/history, data/advance/history), so they never mix.
   hist.days[] = { day, date, gross, complete, premiere }                  */
const ymdOf = (d) => String(d.date || d.ymd || "").replace(/-/g, "");
const sortedDays = (hist) =>
  ((hist && hist.days) || [])
    .map((d) => Object.assign({}, d, { _ymd: ymdOf(d) }))
    .filter((d) => /^\d{8}$/.test(d._ymd))
    .sort((a, b) => a._ymd.localeCompare(b._ymd));

// kind: "daily" | "historical" | "advance"
// opts.upTo: (daily) last date (YYYYMMDD) to show, i.e. the day being viewed
export function runShapeBlock(kind, hist, opts = {}) {
  let days = sortedDays(hist);
  if (!days.length) return null;

  if (kind === "advance") {
    return block(
      "Advance Run Shape",
      "Advance gross by release date",
      runShape(
        days.map((d) => ({ label: ymdShort(d._ymd), gross: +d.gross || 0, live: false })),
        "release date",
      ),
    );
  }

  if (kind === "daily" && opts.upTo) days = days.filter((d) => d._ymd <= opts.upTo);
  if (!days.length) return null;
  const today = opts.today || "";
  const bars = days.map((d, i) => ({
    label: d.premiere ? "P" : "D" + (d.day || i + 1),
    gross: +d.gross || 0,
    live: typeof d.complete === "boolean" ? !d.complete : d._ymd >= today && !!today,
  }));
  return kind === "daily"
    ? block("Daily Run Shape", "Gross by day, up to the selected day", runShape(bars))
    : block("Historical Run Shape", "Gross by day, full run", runShape(bars));
}
