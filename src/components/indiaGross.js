import { h } from "../core/dom.js";
import { DL } from "../core/exportState.js";
import { inr } from "../core/format.js";

/* "India Gross" headline in the movie hero: the running total up to the day on
   screen (kpi.indiaGross, data/<mode>/<date>/m/<slug>.json). Filled by the tab
   renderers (the hero is built before them); a missing value clears it. */
export function setIndiaGross(value, { label = "India gross", day, running } = {}) {
  // the downloaded card shows the same headline as the page
  if (DL.meta)
    DL.meta.india =
      value == null || value === "" || !isFinite(+value)
        ? null
        : { value: +value, label, day, running: !!running };
  const el = document.querySelector(".movie-hero .mh-india");
  if (!el) return;
  if (value == null || value === "" || !isFinite(+value)) {
    el.replaceChildren();
    return;
  }
  const txt = inr(+value); // "₹12.11 Cr" / "₹52.68 L" / "₹41,700"
  const i = txt.lastIndexOf(" ");
  const amount = i > 0 ? txt.slice(0, i) : txt;
  const unit = i > 0 ? txt.slice(i + 1) : "";
  el.replaceChildren(
    h("b", { class: "mi-v" }, amount, unit ? h("small", null, unit) : null),
    h(
      "span",
      { class: "mi-l" },
      label,
      day ? " · " : "",
      day ? h("em", null, day) : null,
      running ? " running" : "",
    ),
  );
}
