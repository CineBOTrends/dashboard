import { h, icon } from "../../core/dom.js";
import { go } from "../../core/router.js";

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function heroValue(iconName, title, detail) {
  return h(
    "div",
    { class: "hero-value" },
    icon(iconName),
    h("div", null, h("strong", null, title), h("span", null, detail)),
  );
}
export function homeFeatureCarousel(features) {
  let active = 0;
  let paused = false;
  const art = h("div", { class: "feature-card-art" });
  const eyebrow = h("div", { class: "feature-card-eyebrow" });
  const title = h("h2", null);
  const summary = h("p", { class: "feature-card-summary" });
  const detail = h("p", { class: "feature-card-detail" });
  const metric = h("span", { class: "feature-card-metric" });
  const action = h("span", { class: "feature-card-action" });
  const dots = features.map((feature, index) =>
    h("button", {
      class: "feature-card-dot",
      type: "button",
      "aria-label": "Show " + feature.title,
      onclick: () => paint(index),
    }),
  );
  const card = h(
    "button",
    {
      class: "feature-card",
      type: "button",
      onmouseenter: () => {
        paused = true;
      },
      onmouseleave: () => {
        paused = false;
      },
      onfocusin: () => {
        paused = true;
      },
      onfocusout: () => {
        paused = false;
      },
      onclick: () => go(features[active].path),
    },
    art,
    h(
      "div",
      { class: "feature-card-content" },
      eyebrow,
      title,
      summary,
      detail,
      h("div", { class: "feature-card-footer" }, metric, action),
    ),
  );
  const carousel = h(
    "aside",
    { class: "home-feature", "aria-label": "Featured CineBOTrends content" },
    card,
    h("div", { class: "feature-card-dots" }, ...dots),
  );

  function paint(index) {
    active = index;
    const feature = features[active];
    art.style.backgroundImage = feature.image
      ? `linear-gradient(180deg, rgba(14,12,9,.05), rgba(14,12,9,.92)), url("${feature.image}")`
      : "";
    art.classList.toggle("has-image", !!feature.image);
    eyebrow.textContent = feature.eyebrow;
    title.textContent = feature.title;
    summary.textContent = feature.summary;
    detail.textContent = feature.detail;
    metric.textContent = feature.metric;
    action.replaceChildren("View details ", icon("arrow-right"));
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === active);
      dot.setAttribute("aria-current", String(dotIndex === active));
    });
  }

  paint(0);
  const timer = window.setInterval(() => {
    if (!document.body.contains(carousel)) {
      window.clearInterval(timer);
    } else if (!paused) {
      paint((active + 1) % features.length);
    }
  }, 5000);
  return carousel;
}
export function social_kpi(n, l) {
  return h(
    "div",
    { class: "kpi" },
    h("div", { class: "n" }, n),
    h("div", { class: "l" }, l),
  );
}
