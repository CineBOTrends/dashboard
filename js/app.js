/* ============================================================
   CineBOTrends — core (app.js)
   DOM helpers · formatters · data layer · shared chrome · router
   Exposes window.__CBO for screens.js
   ============================================================ */
(function () {
  "use strict";

  const $app = document.getElementById("app");

  /* ---------- DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function")
          el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const frag = (...kids) => {
    const f = document.createDocumentFragment();
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      f.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return f;
  };
  const icon = (name, cls) =>
    h("i", { class: "fi fi-rr-" + name + (cls ? " " + cls : "") });

  /* ---------- formatters ---------- */
  // Indian digit grouping
  function grp(n) {
    n = Math.round(Number(n) || 0);
    const s = String(Math.abs(n));
    let out;
    if (s.length <= 3) out = s;
    else {
      const last3 = s.slice(-3);
      let rest = s.slice(0, -3);
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      out = rest + "," + last3;
    }
    return (n < 0 ? "-" : "") + out;
  }
  // rupees -> Cr / L compact
  function inr(v) {
    v = Number(v) || 0;
    if (v >= 1e7) return "₹" + (v / 1e7).toFixed(2) + " Cr";
    if (v >= 1e5) return "₹" + (v / 1e5).toFixed(2) + " L";
    return "₹" + grp(v);
  }
  const inrFull = (v) => "₹" + grp(v);
  const pct = (v) => (Number(v) || 0).toFixed(1) + "%";
  const num = (v) => grp(v);

  function fmtDate(ymd) {
    if (!ymd || ymd.length !== 8) return ymd || "";
    const d = new Date(
      +ymd.slice(0, 4),
      +ymd.slice(4, 6) - 1,
      +ymd.slice(6, 8),
    );
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  function fmtDateLong(ymd) {
    if (!ymd || ymd.length !== 8) return ymd || "";
    const d = new Date(
      +ymd.slice(0, 4),
      +ymd.slice(4, 6) - 1,
      +ymd.slice(6, 8),
    );
    return d.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  // "2026-06-29 13:31 IST" -> "29 Jun 2026, 1:31 PM"
  function fmtUpdated(s) {
    if (!s) return "";
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return String(s);
    const [, Y, Mo, D, H, Mi] = m.map(Number);
    const d = new Date(Y, Mo - 1, D, H, Mi);
    if (isNaN(d)) return String(s);
    const datePart = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timePart = d
      .toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\s*(am|pm)$/i, (x) => " " + x.trim().toUpperCase());
    return `${datePart}, ${timePart}`;
  }

  // "2026-06-20" -> "20 Jun 2026"
  function fmtReleaseDate(s) {
    if (!s) return "";
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(s);
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d)) return String(s);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const cache = new Map();
  async function getJSON(path) {
    if (cache.has(path)) return cache.get(path);
    const p = fetch(path, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + path);
      return r.json();
    });
    cache.set(path, p);
    try {
      return await p;
    } catch (e) {
      cache.delete(path);
      throw e;
    }
  }
  const Data = {
    manifest: () => getJSON("data/manifest.json"),
    national: (mode, date) => getJSON(`data/${mode}/${date}/national.json`),
    movie: (mode, date, slug) => getJSON(`data/${mode}/${date}/m/${slug}.json`),
    history: (mode, slug) => getJSON(`data/${mode}/history/${slug}.json`),
    news: () => getJSON("data/news.json"),
    reviews: () => getJSON("data/reviews.json"),
    boxoffice: () => getJSON("data/boxoffice.json"),
  };

  /* ---------- routing ---------- */
  const enc = encodeURIComponent,
    dec = decodeURIComponent;
  const go = (hash) => {
    location.hash = hash;
  };
  function parts() {
    return location.hash
      .replace(/^#\/?/, "")
      .split("/")
      .filter(Boolean)
      .map(dec);
  }

  /* ---------- shared chrome ---------- */
  function header() {
    const nav = h(
      "nav",
      { class: "nav", id: "nav" },
      h("a", { href: "#/home", onclick: closeNav }, "Home"),
      h("a", { href: "#/movies", onclick: closeNav }, "All Movies"),
      h(
        "a",
        {
          href: "#/home#live",
          class: "live",
          onclick: (e) => {
            closeNav();
            jumpTo(e, "live");
          },
        },
        "Live Box Office Tracking",
      ),
      h("a", { href: "#/boxoffice", onclick: closeNav }, "Box Office Updates"),
      h("a", { href: "#/news", onclick: closeNav }, "Movie News"),
      h("a", { href: "#/reviews", onclick: closeNav }, "Movie Reviews"),
      h("a", { href: "#/about", onclick: closeNav }, "About"),
      h("a", { href: "#/contact", onclick: closeNav }, "Contact"),
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
            h("img", { src: "assets/logo-mark.PNG", alt: "" }),
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
  function toast(msg, anchor) {
    let t = document.getElementById("cbo-toast");
    if (!t) {
      t = h("div", { class: "toast", id: "cbo-toast" });
      (document.body || document.getElementById("app")).appendChild(t);
    }
    t.textContent = msg;
    if (anchor && anchor.getBoundingClientRect) {
      const r = anchor.getBoundingClientRect();
      t.classList.add("anchored");
      t.style.left = Math.round(r.left) + "px";
      t.style.top = Math.round(r.bottom + 10) + "px";
    } else {
      t.classList.remove("anchored");
      t.style.left = "";
      t.style.top = "";
    }
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function jumpTo(e, id) {
    if (location.hash.startsWith("#/home")) {
      if (e) e.preventDefault();
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }
  const X_URL = "https://x.com/cinebotrends?s=11";
  function xIcon() {
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
      arr.map((x) => h("a", { href: x[1] || "#/home", onclick: x[2] }, x[0]));
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
              html: '<img class="foot-mark" src="assets/logo-mark.PNG" alt=""/>Cine<b>BOTrends</b>',
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
                { href: "#/home", "aria-label": "Instagram" },
                icon("camera"),
              ),
              h("a", { href: "#/home", "aria-label": "YouTube" }, icon("play")),
              h(
                "a",
                { href: "#/home", "aria-label": "Telegram" },
                icon("paper-plane"),
              ),
            ),
          ),
          h(
            "div",
            null,
            h("h4", null, "Quick Links"),
            links([
              ["Home", "#/home"],
              [
                "Movies",
                "#/home",
                (e) => {
                  jumpMovies(e);
                },
              ],
              ["Release Calendar", "#/home"],
              ["Box Office Tracker", "#/home"],
              ["About", "#/about"],
              ["Contact", "#/contact"],
            ]),
          ),
          h(
            "div",
            null,
            h("h4", null, "Legal"),
            links([
              ["Privacy Policy", "#/about"],
              ["Terms & Conditions", "#/about"],
              ["Copyright Policy", "#/about"],
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

  /* ---------- shared components ---------- */
  function occMeter(p) {
    p = Math.max(0, Math.min(100, Number(p) || 0));
    return h(
      "span",
      { class: "occ" },
      h("span", { class: "bar" }, h("i", { style: `width:${p}%` })),
      h("span", { class: "pct" }, p.toFixed(1) + "%"),
    );
  }
  function kpiCard(label, value, sub, ic, gold) {
    return h(
      "div",
      { class: "kpi-card" },
      h("div", { class: "l" }, ic && icon(ic), label),
      h("div", { class: "n" + (gold ? " gold" : "") }, value),
      sub && h("div", { class: "s" }, sub),
    );
  }
  function stateMsg(ic, title, body) {
    return h(
      "div",
      { class: "state-msg" },
      h("div", { class: "ic" }, icon(ic)),
      h("h3", null, title),
      body && h("p", null, body),
    );
  }
  function loading() {
    return h("div", { class: "loading" }, h("div", { class: "spinner" }));
  }

  function mount(node) {
    $app.replaceChildren(node);
    window.scrollTo(0, 0);
  }
  // page = chrome-wrapped content
  function page(content) {
    return frag(header(), h("main", null, content), footer());
  }

  /* ---------- error helper ---------- */
  function fetchError(err) {
    const offline =
      String((err && err.message) || "").includes("Failed to fetch") ||
      location.protocol === "file:";
    return page(
      h(
        "div",
        { class: "wrap" },
        stateMsg(
          "triangle-warning",
          offline
            ? "Run a local server to load data"
            : "Couldn't load this view",
          offline
            ? frag(
                "The dashboard reads JSON from the data folder, which browsers block on file://. Start a server in this folder: ",
                h("code", null, "python3 -m http.server"),
                " then open ",
                h("code", null, "http://localhost:8000"),
                ".",
              )
            : "Try refreshing. If it persists, rebuild the data with build_data.py.",
        ),
      ),
    );
  }

  /* ---------- expose ---------- */
  window.__CBO = {
    h,
    frag,
    icon,
    grp,
    inr,
    inrFull,
    pct,
    num,
    fmtDate,
    fmtDateLong,
    fmtUpdated,
    fmtReleaseDate,
    Data,
    enc,
    dec,
    go,
    parts,
    mount,
    page,
    header,
    footer,
    occMeter,
    kpiCard,
    stateMsg,
    loading,
    fetchError,
    $app,
    xIcon,
    X_URL,
  };

  /* ---------- boot: splash then route ---------- */
  const Screens = (window.__CBO.Screens = {});
  async function render() {
    if (!window.Screens) return; // screens.js attaches
  }

  window.__CBO.render = function render() {
    const p = parts();
    const S = window.__CBO.Screens;
    try {
      if (p.length === 0) return S.home(); // after splash we route to home
      if (p[0] === "home") return S.home();
      if (p[0] === "movies") return S.movies();
      if (p[0] === "about") return S.about();
      if (p[0] === "contact") return S.contact();
      if (p[0] === "news") return S.news(p);
      if (p[0] === "reviews") return S.reviews(p);
      if (p[0] === "boxoffice") return S.boxoffice(p);
      if (p[0] === "movie") return S.movie(p); // movie/<slug>/<tab?>/state/<s>/city/<c>
      return S.home();
    } catch (e) {
      console.error(e);
      mount(fetchError(e));
    }
  };

  window.addEventListener("hashchange", () => window.__CBO.render());

  // splash intro (2.5s, respects reduced motion), then hand off to router
  window.__CBO.boot = function boot() {
    const splash = document.getElementById("splash");
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const finish = () => {
      if (splash) {
        splash.classList.add("out");
        setTimeout(() => splash.remove(), 500);
      }
      if (!location.hash) location.hash = "#/home";
      window.__CBO.render();
    };
    setTimeout(finish, reduce ? 200 : 2400);
  };

  /* ---------- auto-refresh: re-pull data while the page is left open ----------
     The collector + build_data refresh the JSON on disk every few minutes.
     This clears the in-memory cache and re-renders the current view so an open
     tab updates itself without a manual reload. Only runs when the tab is
     visible, to avoid needless fetches. */
  const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    if (document.hidden) return;
    try {
      cache.clear();
      if (window.__CBO && window.__CBO.render) window.__CBO.render();
    } catch (e) {
      /* ignore transient refresh errors */
    }
  }, AUTO_REFRESH_MS);
})();
