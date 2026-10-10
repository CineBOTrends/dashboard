import "../../styles/editorial.css";
import { mount, page } from "../../components/chrome.js";
import { h } from "../../core/dom.js";
import { fmtReleaseDate } from "../../core/format.js";

import { Data } from "../../core/store.js";

/* ---------- editorial screens (admin-posted content) ---------- */
// date "2026-06-29" -> "29 Jun 2026"
function postDate(s) {
  return s ? fmtReleaseDate(String(s).slice(0, 10)) : "";
}
// very small + safe markdown-ish body -> paragraphs (no raw HTML injection)
function bodyBlocks(text) {
  const parts = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((p) =>
    h("p", { style: "margin:0 0 14px;line-height:1.7;font-size:15px" }, p),
  );
}
function emptyState(label) {
  return h(
    "p",
    {
      class: "muted",
      style: "max-width:640px;font-size:15px;margin-top:10px",
    },
    "No " + label + " posted yet. Check back soon.",
  );
}
function editorialHeader(eyebrow, title) {
  return [
    h("div", { class: "eyebrow" }, eyebrow),
    h(
      "h2",
      {
        class: "display",
        style: "font-size:clamp(28px,5vw,46px);margin:8px 0 18px",
      },
      title,
    ),
  ];
}

// Generic list+detail renderer. p = route parts, e.g. ["news"] or ["news","<slug>"]
async function editorialScreen(p, opts) {
  const { eyebrow, title, label, fetchFn, card, detail } = opts;
  let items = [];
  try {
    const data = await fetchFn();
    items = Array.isArray(data) ? data : data.items || [];
  } catch (e) {
    // missing file = nothing posted yet; treat as empty, not an error
    items = [];
  }
  // sort newest first by date
  items.sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );

  // detail view if a slug is in the route
  const slug = p[1] ? decodeURIComponent(p[1]) : null;
  if (slug) {
    const item = items.find((x) => x.slug === slug);
    if (item) {
      mount(page(h("div", { class: "wrap section" }, detail(item))));
      return;
    }
  }

  mount(
    page(
      h(
        "div",
        { class: "wrap section" },
        ...editorialHeader(eyebrow, title),
        items.length
          ? h("div", { class: "ed-list" }, ...items.map((it) => card(it)))
          : emptyState(label),
      ),
    ),
  );
}

export const news = function (p) {
  editorialScreen(p, {
    eyebrow: "Movie News",
    title: "Movie News",
    label: "news",
    fetchFn: Data.news,
    card: (it) =>
      h(
        "a",
        { class: "ed-card", href: "/news/" + encodeURIComponent(it.slug) },
        it.image
          ? h("div", {
              class: "ed-thumb",
              style: `background-image:url('${it.image}')`,
            })
          : null,
        h(
          "div",
          { class: "ed-body" },
          h("div", { class: "ed-date" }, postDate(it.date)),
          h("div", { class: "ed-title" }, it.title || "Untitled"),
          it.summary ? h("div", { class: "ed-excerpt" }, it.summary) : null,
        ),
      ),
    detail: (it) =>
      h(
        "article",
        { class: "ed-article" },
        h("div", { class: "eyebrow" }, "Movie News"),
        h(
          "h2",
          {
            class: "display",
            style: "font-size:clamp(26px,4.5vw,40px);margin:6px 0 6px",
          },
          it.title || "Untitled",
        ),
        h(
          "div",
          { class: "ed-date", style: "margin-bottom:16px" },
          postDate(it.date),
        ),
        it.image
          ? h("img", { class: "ed-hero", src: it.image, alt: it.title || "" })
          : null,
        h("div", { class: "ed-copy" }, ...bodyBlocks(it.body)),
        h("a", { href: "/news", class: "ed-back" }, "\u2190 All news"),
      ),
  });
};

export const reviews = function (p) {
  editorialScreen(p, {
    eyebrow: "Movie Reviews",
    title: "Movie Reviews",
    label: "reviews",
    fetchFn: Data.reviews,
    card: (it) =>
      h(
        "a",
        {
          class: "ed-card",
          href: "/reviews/" + encodeURIComponent(it.slug),
        },
        it.poster
          ? h("div", {
              class: "ed-thumb",
              style: `background-image:url('${it.poster}')`,
            })
          : null,
        h(
          "div",
          { class: "ed-body" },
          h("div", { class: "ed-date" }, postDate(it.date)),
          h("div", { class: "ed-title" }, it.movie || it.title || "Untitled"),
          it.rating != null
            ? h("div", { class: "ed-rating" }, "\u2605 " + it.rating + "/5")
            : null,
          it.summary ? h("div", { class: "ed-excerpt" }, it.summary) : null,
        ),
      ),
    detail: (it) =>
      h(
        "article",
        { class: "ed-article" },
        h("div", { class: "eyebrow" }, "Movie Review"),
        h(
          "h2",
          {
            class: "display",
            style: "font-size:clamp(26px,4.5vw,40px);margin:6px 0 6px",
          },
          it.movie || it.title || "Untitled",
        ),
        h(
          "div",
          {
            style:
              "display:flex;gap:12px;align-items:center;margin-bottom:16px",
          },
          it.rating != null
            ? h("div", { class: "ed-rating" }, "\u2605 " + it.rating + "/5")
            : null,
          h("div", { class: "ed-date" }, postDate(it.date)),
        ),
        it.poster
          ? h("img", {
              class: "ed-hero",
              src: it.poster,
              alt: it.movie || "",
            })
          : null,
        h("div", { class: "ed-copy" }, ...bodyBlocks(it.body)),
        h("a", { href: "/reviews", class: "ed-back" }, "\u2190 All reviews"),
      ),
  });
};

export const boxoffice = function (p) {
  editorialScreen(p, {
    eyebrow: "Box Office Updates",
    title: "Box Office Updates",
    label: "box office updates",
    fetchFn: Data.boxoffice,
    card: (it) =>
      h(
        "a",
        {
          class: "ed-card",
          href: "/boxoffice/" + encodeURIComponent(it.slug),
        },
        it.image
          ? h("div", {
              class: "ed-thumb",
              style: `background-image:url('${it.image}')`,
            })
          : null,
        h(
          "div",
          { class: "ed-body" },
          h(
            "div",
            { class: "ed-date" },
            [postDate(it.date), it.reportType]
              .filter(Boolean)
              .join(" \u00b7 "),
          ),
          h("div", { class: "ed-title" }, it.title || "Untitled"),
          it.movie ? h("div", { class: "ed-excerpt" }, it.movie) : null,
        ),
      ),
    detail: (it) =>
      h(
        "article",
        { class: "ed-article" },
        h(
          "div",
          { class: "eyebrow" },
          ["Box Office", it.reportType].filter(Boolean).join(" \u00b7 "),
        ),
        h(
          "h2",
          {
            class: "display",
            style: "font-size:clamp(26px,4.5vw,40px);margin:6px 0 6px",
          },
          it.title || "Untitled",
        ),
        h(
          "div",
          { class: "ed-date", style: "margin-bottom:16px" },
          [it.movie, postDate(it.date)].filter(Boolean).join(" \u00b7 "),
        ),
        it.image
          ? h("img", { class: "ed-hero", src: it.image, alt: it.title || "" })
          : null,
        h("div", { class: "ed-copy" }, ...bodyBlocks(it.body)),
        h(
          "a",
          { href: "/boxoffice", class: "ed-back" },
          "\u2190 All updates",
        ),
      ),
  });
};
