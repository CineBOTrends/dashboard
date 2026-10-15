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
  const langs = (m.langs || []).filter((x) => x && !/^unknown$/i.test(String(x).trim()));
  const fmts = m.formats || [];
  // chips: (area) + languages (original first, gold) + formats - like the page hero
  const langChip =
    langs.length > 2 ? langs.slice(0, 2).join(", ") + ", +" + (langs.length - 2) : langs.join(", ");
  const chips = [
    ...(sc ? [{ t: sc.name, accent: true }] : []),
    ...(langChip ? [{ t: langChip }] : []),
    ...(fmts.length ? [{ t: fmts.join(", ").toUpperCase() }] : []),
  ];
  const facts = [
    ["Genre", (m.genres || []).join(", ")],
    ["Runtime", m.runtime],
    ["Certification", m.certification],
  ].filter(([, v]) => v);

  // the same "India gross" headline the page shows (set by setIndiaGross)
  const ig = !sc && m.india && m.india.value != null ? m.india : null;
  let igAmount = "";
  let igUnit = "";
  if (ig) {
    const txt = inr(ig.value);
    const i = txt.lastIndexOf(" ");
    igAmount = i > 0 ? txt.slice(0, i) : txt;
    igUnit = i > 0 ? txt.slice(i + 1) : "";
  }

  // stat tiles: explicit stats (global, in $) or the rupee KPI of a movie
  const stats =
    sc && sc.stats
      ? sc.stats
      : m.stats && m.stats.length
        ? m.stats
        : k.gross != null
          ? [
              { label: "Gross", value: inr(k.gross), accent: true },
              // no separate tile when the headline above already shows it
              ...(k.indiaGross != null && !ig
                ? [{ label: m.indiaLabel || "India Gross", value: inr(k.indiaGross), accent: true }]
                : []),
              {
                label: "Tickets",
                value: num(k.sold),
                sub: k.seats ? num(k.seats) + " seats" : "",
              },
              { label: "Shows", value: num(k.shows) },
              // the full day strip, so the summary download needs no second copy
              ...(k.theatres != null
                ? [
                    { label: "Theatres", value: num(k.theatres) },
                    {
                      label: "Cities",
                      value: num(k.cities),
                      sub: k.states ? num(k.states) + " states" : "",
                    },
                    { label: "Occupancy", value: pct(k.occupancy), sub: "weighted avg" },
                    { label: "Fast-filling", value: num(k.fastfilling), sub: "50-98%" },
                    {
                      label: "Housefull",
                      value: num(k.housefull),
                      accent: true,
                      sub: "\u2265 98%",
                    },
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
      chips.length
        ? h(
            "div",
            { class: "exp-pills" },
            ...chips.map((p) =>
              h("span", { class: "exp-pill" + (p.accent ? " accent" : "") }, p.t),
            ),
          )
        : null,
      facts.length
        ? h(
            "div",
            { class: "exp-facts" },
            ...facts.map(([l, v]) =>
              h("div", { class: "exp-fact" }, h("span", null, l), h("b", null, v)),
            ),
          )
        : null,
      ig
        ? h(
            "div",
            { class: "exp-india" },
            h("b", { class: "mi-v" }, igAmount, igUnit ? h("small", null, igUnit) : null),
            h(
              "span",
              { class: "mi-l" },
              ig.label,
              ig.day ? " \u00b7 " : "",
              ig.day ? h("em", null, ig.day) : null,
              ig.running ? " running" : "",
            ),
          )
        : null,
      h(
        "div",
        { class: "exp-caption" },
        (sc ? sc.name + "  \u203a  " : "") +
          [m.ctxLabel, sectionTitle].filter(Boolean).join("  \u00b7  "),
      ),
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
                s.sub ? h("span", { class: "exp-stat-s" }, s.sub) : null,
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
      { class: "exp-card" + (summaryOnly ? " summary" : "") },
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
