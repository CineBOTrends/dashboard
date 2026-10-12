import { h, icon } from "../../core/dom.js";

/* The three entry cards on the home screen: Live Tracking, Advance Sales and
   Overseas Tracking. Each opens its own listing screen (/live, /advance,
   /overseas). `items`: [{ title, desc, path, icon, live, bg, stats:[{v,l}], cta }] */
export function hubSection(items) {
  return h(
    "section",
    { class: "section hub", id: "tracking" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "section-head" },
        h(
          "div",
          null,
          h("div", { class: "eyebrow" }, "Box office tracking"),
          h("h2", null, "Choose what to follow"),
        ),
      ),
      h("div", { class: "hub-grid" }, ...items.map(hubCard)),
    ),
  );
}

function hubCard(it) {
  return h(
    "a",
    {
      class: "hub-card",
      href: it.path,
      style: it.bg ? `--hub-bg:url("${it.bg}")` : "",
    },
    h("div", { class: "hub-bg" }),
    h(
      "div",
      { class: "hub-body" },
      h(
        "div",
        { class: "hub-top" },
        h("span", { class: "hub-ico" }, icon(it.icon)),
        it.live
          ? h("span", { class: "hub-live" }, h("span", { class: "live-dot" }), "LIVE")
          : null,
      ),
      h("h3", null, it.title),
      h("p", null, it.desc),
      h(
        "div",
        { class: "hub-stats" },
        ...it.stats.map((s) =>
          h("div", { class: "hub-stat" }, h("b", null, String(s.v)), h("span", null, s.l)),
        ),
      ),
      h("div", { class: "hub-cta" }, it.cta, icon("arrow-right")),
    ),
  );
}
