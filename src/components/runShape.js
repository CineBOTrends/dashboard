import { h } from "../core/dom.js";
import { inr } from "../core/format.js";

/* Run shape: one bar per tracked day (D1, D2, ...), height = that day's gross.
   `days`: [{ label, gross, live }] oldest -> newest. Heights are explicit px
   (not %), so the PNG export renders the same on every browser. */
const MAX_H = 150;

export function runShape(days) {
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
    h("div", { class: "rs-cap" }, `Run shape · all ${days.length} ${days.length === 1 ? "day" : "days"}`),
  );
}
