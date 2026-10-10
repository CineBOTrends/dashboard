import { h, icon } from "../core/dom.js";

export function occMeter(p) {
  // percentage only — the bar was eating a third of the table width and
  // colliding with the next column on mobile
  p = Math.max(0, Math.min(100, Number(p) || 0));
  return h(
    "span",
    { class: "occ" },
    h("span", { class: "pct" }, p.toFixed(1) + "%"),
  );
}
export function kpiCard(label, value, sub, ic, gold) {
  return h(
    "div",
    { class: "kpi-card" },
    h("div", { class: "l" }, ic && icon(ic), label),
    h("div", { class: "n" + (gold ? " gold" : "") }, value),
    sub && h("div", { class: "s" }, sub),
  );
}
