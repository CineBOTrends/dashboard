import { h, icon } from "../core/dom.js";
import { inr } from "../core/format.js";
import { posterUrl } from "../core/poster.js";
import { enc, go } from "../core/router.js";

// `slug` may be a single slug or a list of candidates (tried in order until
// one image loads - see posterSlugsOf()).
export function posterEl(title, slug) {
  const initials = String(title || "")
    .replace(/\([^)]*\)/g, " ") // "Ranabaali (2026)" -> "R", not "R("
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
  const el = h("div", { class: "poster" }, h("div", { class: "reel" }));
  const initial = h("div", { class: "initial" }, initials || "★");
  const cands = (Array.isArray(slug) ? slug : [slug]).filter(Boolean);
  const urlAt = (i) => posterUrl(cands[i], "thumb");
  if (cands.length) {
    let i = 0;
    const img = h("img", {
      class: "poster-img",
      loading: "lazy",
      alt: title,
      src: urlAt(0),
    });
    img.addEventListener("error", () => {
      if (++i < cands.length) {
        img.src = urlAt(i);
        return;
      }
      img.remove();
      el.classList.remove("hasimg");
      el.append(initial);
    });
    el.classList.add("hasimg");
    el.append(img);
  } else {
    el.append(initial);
  }
  return el;
}

export function movieCard(mv, mode, date, opts) {
  opts = opts || {};
  const gross = opts.advance && mv.indiaGross != null ? mv.indiaGross : mv.gross;
  const poster = posterEl(mv.title, mv.slug);
  poster.append(
    h(
      "div",
      { class: "badges" },
      opts.advance
        ? h(
            "span",
            { class: "badge advancetrack" },
            h("span", { class: "live-dot" }),
            "Advance Tracking",
          )
        : h(
            "span",
            { class: "badge livetrack" },
            h("span", { class: "live-dot" }),
            "Live Tracking",
          ),
      h("span", { class: "badge nation" }, icon("globe"), " India"),
    ),
  );
  const target = `/movie/${enc(mv.slug)}/${mode}/${date}`;
  return h(
    "div",
    {
      class: "mcard",
      role: "button",
      tabindex: "0",
      "data-event-code": mv.eventCode || "",
      onclick: () => go(target),
      onkeydown: (e) => {
        if (e.key === "Enter") go(target);
      },
    },
    poster,
    h(
      "div",
      { class: "body" },
      h("div", { class: "ttl" }, mv.title),
      h(
        "div",
        { class: "langs" },
        mv.languages.join(" · ") + (mv.formats.length ? "  •  " + mv.formats.join("/") : ""),
      ),
      (mv.genres && mv.genres.length) || mv.certification || mv.runTime
        ? h(
            "div",
            { class: "cardmeta" },
            mv.genres && mv.genres.length
              ? h("span", { class: "g" }, mv.genres.slice(0, 2).join(", "))
              : null,
            mv.certification ? h("span", { class: "cert" }, mv.certification) : null,
            mv.runTime ? h("span", { class: "rt" }, mv.runTime) : null,
          )
        : null,
      gross != null
        ? h(
            "div",
            { class: "card-gross" },
            h(
              "span",
              { class: "cg-label" },
              opts.advance
                ? "Cumulative Advance Gross"
                : mode === "daily"
                  ? "Today's Gross"
                  : "Gross",
            ),
            h("span", { class: "cg-val" }, inr(gross || 0)),
          )
        : null,
      mv.eventCode ? h("div", { class: "evcode" }, icon("ticket"), mv.eventCode) : null,
    ),
  );
}
