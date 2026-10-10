import { X_URL } from "../core/config.js";
import { frag, h, icon } from "../core/dom.js";
import { go } from "../core/router.js";

function header() {
  const nav = h(
    "nav",
    { class: "nav", id: "nav" },
    h("a", { href: "/home", onclick: closeNav }, "Home"),
    h("a", { href: "/movies", onclick: closeNav }, "All Movies"),
    h("a", { href: "/boxoffice", onclick: closeNav }, "Box Office Updates"),
    h("a", { href: "/multiplex", onclick: closeNav }, "Multiplex"),
    h("a", { href: "/news", onclick: closeNav }, "Movie News"),
    h("a", { href: "/reviews", onclick: closeNav }, "Movie Reviews"),
    // About and Contact remain available by direct route but are hidden from the header.
  );
  return h(
    "header",
    { class: "site-header" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "brand-mark", onclick: () => go("/home") },
        h(
          "span",
          { class: "dot" },
          h("img", { src: "/assets/logo-mark.png", alt: "" }),
        ),
        h("span", { class: "name", html: "Cine<b>BOTrends</b>" }),
      ),
      nav,
      h(
        "button",
        { class: "nav-toggle", "aria-label": "Menu", onclick: toggleNav },
        icon("menu-burger"),
      ),
    ),
  );
}
function toggleNav() {
  document.getElementById("nav")?.classList.toggle("open");
}
function closeNav() {
  document.getElementById("nav")?.classList.remove("open");
}
function jumpMovies(e) {
  jumpTo(e, "movies");
}
function jumpTo(e, id) {
  if (location.pathname === "/" || location.pathname.startsWith("/home")) {
    if (e) e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }
}

export function xIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute(
    "d",
    "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  );
  svg.appendChild(p);
  return svg;
}

function footer() {
  const links = (arr) =>
    arr.map((x) => h("a", { href: x[1] || "/home", onclick: x[2] }, x[0]));
  return h(
    "footer",
    { class: "site-footer" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "foot-grid" },
        h(
          "div",
          { class: "foot-brand" },
          h("div", {
            class: "name",
            html: '<img class="foot-mark" src="/assets/logo-mark.png" alt=""/>Cine<b>BOTrends</b>',
          }),
          h(
            "p",
            { class: "muted" },
            "Real-time box office intelligence across India — collections, occupancy, theatre and city-level insight, refreshed through the day.",
          ),
          h(
            "div",
            { class: "social-row" },
            h(
              "a",
              {
                href: X_URL,
                target: "_blank",
                rel: "noopener",
                "aria-label": "X (Twitter)",
              },
              xIcon(),
            ),
            h(
              "a",
              { href: "/home", "aria-label": "Instagram" },
              icon("camera"),
            ),
            h("a", { href: "/home", "aria-label": "YouTube" }, icon("play")),
            h(
              "a",
              { href: "/home", "aria-label": "Telegram" },
              icon("paper-plane"),
            ),
          ),
        ),
        h(
          "div",
          null,
          h("h4", null, "Quick Links"),
          links([
            ["Home", "/home"],
            [
              "Movies",
              "/home",
              (e) => {
                jumpMovies(e);
              },
            ],
            ["Release Calendar", "/home"],
            ["Box Office Tracker", "/home"],
            ["About", "/about"],
            ["Contact", "/contact"],
          ]),
        ),
        h(
          "div",
          null,
          h("h4", null, "Legal"),
          links([
            ["Privacy Policy", "/about"],
            ["Terms & Conditions", "/about"],
            ["Copyright Policy", "/about"],
          ]),
        ),
        h(
          "div",
          null,
          h("h4", null, "Newsletter"),
          h(
            "p",
            { class: "muted" },
            "Stay updated with the latest box office trends.",
          ),
          h(
            "div",
            { class: "news" },
            h("input", {
              type: "email",
              placeholder: "you@email.com",
              "aria-label": "Email",
            }),
            h(
              "button",
              {
                class: "btn sm",
                onclick: () => alert("Subscribed — thanks!"),
              },
              "Subscribe",
            ),
          ),
          h(
            "p",
            { class: "muted", style: "font-size:12px" },
            "No spam. Unsubscribe anytime.",
          ),
        ),
      ),
      h(
        "div",
        { class: "foot-bottom" },
        h("span", null, "© 2026 CineBOTrends. All Rights Reserved."),
        h(
          "span",
          null,
          "Disclaimer: Data is provided for informational and analytical purposes only.",
        ),
      ),
    ),
  );
}

export function mount(node, { keepScroll = false } = {}) {
  const y = window.scrollY;
  document.getElementById("app").replaceChildren(node);
  window.scrollTo(0, keepScroll ? y : 0);
}
// page = chrome-wrapped content
export function page(content) {
  return frag(header(), h("main", null, content), footer());
}
