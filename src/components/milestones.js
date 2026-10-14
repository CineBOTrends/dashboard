import { h, icon } from "../core/dom.js";
import { inr } from "../core/format.js";

/* Milestones · India gross (Live Tracking / Today tab, above Performance
   Breakdown). The ladder (crore) keeps going as far as a film can: a window of
   7 steps is shown - the first 7 (0 ... 150 Cr) until 150 Cr is crossed, then it
   slides forward so the film always sits mid-ladder. The bar fills segment by
   segment, so every step takes the same width however far apart the amounts are.
   `gross` is rupees (same value as the hero's India gross headline). */
const LADDER_CR = [
  0, 5, 10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000,
  4000, 5000,
];
const WINDOW = 7;
const CR = 1e7;
const lbl = (c) => (c === 0 ? "₹0" : "₹" + c + " Cr");

export function milestones(gross) {
  const v = +gross;
  if (gross == null || gross === "" || !isFinite(v) || v < 0) return null;

  // slide the window once the film is past the first 7 steps
  const nextAll = LADDER_CR.findIndex((c) => v < c * CR); // -1 = whole ladder cleared
  const first = nextAll === -1 ? LADDER_CR.length - 1 : nextAll;
  const start = first < WINDOW ? 0 : Math.max(0, Math.min(first - 4, LADDER_CR.length - WINDOW));
  const STEPS_CR = LADDER_CR.slice(start, start + WINDOW);
  const steps = STEPS_CR.map((c) => c * CR);
  const n = steps.length;
  const next = steps.findIndex((s) => v < s); // first milestone not reached; -1 = all cleared

  let p = 1;
  if (next !== -1) {
    const i = next - 1; // last reached (steps[0] = 0, so i >= 0)
    p = (i + (v - steps[i]) / (steps[next] - steps[i])) / (n - 1);
  }
  const w = (Math.min(1, Math.max(0, p)) * 100).toFixed(2) + "%";

  const cols = STEPS_CR.map((c, i) => {
    const reached = next === -1 || i < next;
    const isNext = i === next;
    return h(
      "div",
      {
        class: "ms-step" + (reached ? " done" : "") + (isNext ? " next" : ""),
        style: `--i:${i}`,
      },
      h("span", { class: "ms-dot" }),
      h("div", { class: "ms-amt" }, lbl(c)),
      h(
        "div",
        { class: "ms-sub" },
        reached ? (STEPS_CR[i] === 0 ? "Start" : "Reached") : isNext ? "Next" : "",
      ),
    );
  });

  const foot =
    next === -1
      ? "All milestones cleared · " + lbl(STEPS_CR[n - 1]) + "+"
      : inr(steps[next] - v) + " to go for " + lbl(STEPS_CR[next]);

  return h(
    "section",
    { class: "ms-card" },
    h(
      "div",
      { class: "ms-head" },
      icon("flag"),
      h("span", { class: "ms-title" }, "Milestones · India gross"),
      h("b", { class: "ms-now" }, inr(v)),
    ),
    h(
      "div",
      { class: "ms-scroll" },
      h(
        "div",
        { class: "ms-row", style: `--n:${n}` },
        h(
          "div",
          { class: "ms-track", style: `--w:${w}` },
          h("div", { class: "ms-fill" }),
          // where the film is right now, between two milestones
          h("div", { class: "ms-pin" }, inr(v)),
        ),
        ...cols,
      ),
    ),
    h("div", { class: "ms-foot" }, foot),
  );
}
