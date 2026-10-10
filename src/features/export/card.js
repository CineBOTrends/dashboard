import { h } from "../../core/dom.js";
import { DL } from "../../core/exportState.js";
import { fmtDate, inr, num } from "../../core/format.js";
import { summaryChip, watermarkFooter } from "./assets.js";

export function buildExportCard(section, sectionTitle, A) {
  const m = DL.meta || {};
  const k = m.kpi || {};

  const clone = section.cloneNode(true);
  clone.querySelectorAll(".dl-btn").forEach((b) => b.remove());
  clone.querySelectorAll(".block-hd").forEach((b) => b.remove());
  clone.classList.remove("closed");

  const metaBits = [
    (m.langs || []).join(" · "),
    m.runtime || "",
    (m.genres || []).slice(0, 2).join(", "),
  ].filter(Boolean);

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
        h(
          "div",
          { class: "exp-brand" },
          h("span", null, "Cine", h("b", null, "BO"), "Trends"),
        ),
        h("div", { class: "exp-mode" }, m.ctxLabel || ""),
      ),
      h("h1", { class: "exp-movie" }, m.title || ""),
      metaBits.length
        ? h("div", { class: "exp-submeta" }, metaBits.join("  ·  "))
        : null,
      h("h2", { class: "exp-headline" }, (m.ctxLabel || "") + " breakdown"),
      h("div", { class: "exp-section" }, sectionTitle),
      k.gross != null
        ? h(
            "div",
            { class: "exp-chips" },
            summaryChip("money-bill-wave", inr(k.gross)),
            summaryChip("ticket", num(k.sold)),
            summaryChip("clapperboard-play", num(k.shows)),
          )
        : null,
      h(
        "div",
        { class: "exp-meta" },
        [
          m.date ? fmtDate(m.date) : null,
          m.updated ? "Last Updated: " + m.updated : null,
        ]
          .filter(Boolean)
          .join("  •  "),
      ),
    ),
    A.poster
      ? h(
          "div",
          { class: "exp-hero-r" },
          h("img", { src: A.poster, alt: "" }),
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
        h("div", { class: "exp-body" }, clone),
        watermarkFooter(),
      ),
    ),
  );
}
