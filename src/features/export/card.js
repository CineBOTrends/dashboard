import { h } from "../../core/dom.js";
import { DL } from "../../core/exportState.js";
import { fmtDate, inr, num, pct } from "../../core/format.js";
import { watermarkFooter } from "./assets.js";

export function buildExportCard(section, sectionTitle, A) {
  const m = DL.meta || {};
  const k = m.kpi || {};

  const clone = section.cloneNode(true);
  clone.querySelectorAll(".dl-btn").forEach((b) => b.remove());
  clone.querySelectorAll(".block-hd, .cities-tools, .pager").forEach((b) => b.remove());
  clone.classList.remove("closed");
  // the page calls this block "Performance Breakdown"; in the image it carries the
  // name of what was picked (All India Report, City Wise, State Wise, ...)
  if (sectionTitle)
    clone.querySelectorAll(".perf-title").forEach((t) => (t.textContent = sectionTitle));

  const sc = m.scope || null; // state / city drill-down
  const pills = [...(m.langs || []), m.runtime || "", ...(m.genres || []).slice(0, 2)]
    .filter((x) => x && !/^unknown$/i.test(String(x).trim()))
    .map((t) => ({ t }));
  if (sc) pills.unshift({ t: sc.name, accent: true });

  // stat tiles: explicit stats (global, in $) or the rupee KPI of a movie
  const stats =
    sc && sc.stats
      ? sc.stats
      : m.stats && m.stats.length
        ? m.stats
        : k.gross != null
          ? [
              { label: "Gross", value: inr(k.gross), accent: true },
              // live tracking: the running India total up to this day
              ...(k.indiaGross != null
                ? [{ label: "India Gross", value: inr(k.indiaGross), accent: true }]
                : []),
              { label: "Tickets", value: num(k.sold) },
              { label: "Shows", value: num(k.shows) },
              // the full day strip, so the summary download needs no second copy
              ...(k.theatres != null
                ? [
                    { label: "Theatres", value: num(k.theatres) },
                    { label: "Cities", value: num(k.cities) },
                    { label: "Occupancy", value: pct(k.occupancy) },
                    { label: "Fast-filling", value: num(k.fastfilling) },
                    { label: "Housefull", value: num(k.housefull), accent: true },
                  ]
                : []),
            ]
          : [];

  // Summary downloads (the Advance / Global / Day strip): the header already
  // carries every one of those numbers, so don't repeat them underneath.
  const summaryOnly =
    clone.classList.contains("bd-panel") && !clone.classList.contains("hist") && stats.length > 0;

  const hero = h(
    "div",
    { class: "exp-hero" + (A.bg ? " has-bg" : "") },
    A.bg
      ? h("div", {
          class: "exp-hero-bg",
          style: 'background-image:url("' + A.bg + '")',
        })
      : null,
    h(
      "div",
      { class: "exp-hero-l" },
      h(
        "div",
        { class: "exp-hero-top" },
        h("div", { class: "exp-brand" }, h("span", null, "Cine", h("b", null, "BO"), "Trends")),
        h("div", { class: "exp-mode" }, m.ctxLabel || ""),
      ),
      h("h1", { class: "exp-movie" }, m.title || ""),
      pills.length
        ? h(
            "div",
            { class: "exp-pills" },
            ...pills.map((p) =>
              h("span", { class: "exp-pill" + (p.accent ? " accent" : "") }, p.t),
            ),
          )
        : null,
      h("h2", { class: "exp-headline" }, (m.ctxLabel || "") + " breakdown"),
      h("div", { class: "exp-section" }, sc ? sc.name + "  ›  " + sectionTitle : sectionTitle),
      sc && stats.length ? h("div", { class: "exp-stats-cap" }, sc.name + " · total") : null,
      stats.length
        ? h(
            "div",
            { class: "exp-stats" + (stats.length > 6 ? " many" : "") },
            ...stats.map((s) =>
              h(
                "div",
                { class: "exp-stat" + (s.accent ? " accent" : "") },
                h("span", { class: "exp-stat-l" }, s.label),
                h("b", { class: "exp-stat-v" }, s.value),
              ),
            ),
          )
        : null,
      h(
        "div",
        { class: "exp-meta" },
        [m.date ? fmtDate(m.date) : null, m.updated ? "Last Updated: " + m.updated : null]
          .filter(Boolean)
          .join("  •  "),
      ),
    ),
    A.poster
      ? h(
          "div",
          { class: "exp-hero-r" },
          h("img", { src: A.poster, alt: "" }),
          // perforation, notches and the poster card are painted INTO this
          // image (bakeStub in exportImage.js): no extra elements to mis-position
        )
      : null,
  );

  // The card is wrapped in a frame and we rasterise the FRAME, not the card.
  // Rendering the card directly puts its border on the exact pixel boundary of
  // the canvas, where it gets shaved off (the right edge especially, once the
  // scale factor makes it fractional). Inside a frame the border is interior
  // and cannot be cropped.
  return h(
    "div",
    { class: "exp-frame" },
    h(
      "div",
      { class: "exp-card" },
      hero,
      h(
        "div",
        { class: "exp-inner" },
        summaryOnly ? null : h("div", { class: "exp-body" }, clone),
        watermarkFooter(),
      ),
    ),
  );
}
