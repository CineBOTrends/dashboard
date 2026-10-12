import { posterUrl } from "../../core/poster.js";
import { mount, page, xIcon } from "../../components/chrome.js";
import { fetchError, loading, stateMsg } from "../../components/states.js";
import { X_URL } from "../../core/config.js";
import { frag, h, icon } from "../../core/dom.js";
import { ctx, latest, loadAdvanceFeeds, mergeFeeds } from "../../core/feeds.js";
import { fmtDate, num } from "../../core/format.js";
import { go } from "../../core/router.js";
import { Data } from "../../core/store.js";

import { heroValue, homeFeatureCarousel, social_kpi } from "./featureCarousel.js";
import { safeGlobal } from "./globalStrip.js";
import { hubSection } from "./hub.js";
import { safeEditorial, safeOverseas } from "./overseas.js";
import { safeComingSoon } from "../movie/comingSoon.js";
import { posterSlugOf } from "../../core/poster.js";

export const home = async function () {
  mount(page(h("div", { class: "wrap" }, loading())));
  let c, nat;
  try {
    c = await ctx();
    const mode = c.advDates.length ? "advance" : c.dayDates.length ? "daily" : null;
    if (!mode)
      return mount(
        page(
          h(
            "div",
            { class: "wrap" },
            stateMsg(
              "film",
              "No tracking data yet",
              frag(
                "Run ",
                h("code", null, "python3 build_data.py <collector>"),
                " to populate the dashboard.",
              ),
            ),
          ),
        ),
      );
    const date = latest(mode === "advance" ? c.advDates : c.dayDates);
    nat = await Data.national(mode, date);
    // daily data for the Live Box Office Tracking section (if available)
    let daily = null,
      dailyDate = null;
    if (c.dayDates.length) {
      dailyDate = latest(c.dayDates);
      try {
        daily = await Data.national("daily", dailyDate);
      } catch (e) {
        daily = null;
      }
    }
    // advance data (new releases on pre-sale) â€” ALL dates, since films open
    // on different days and each date holds a different set of movies
    const advFeeds = await loadAdvanceFeeds(c);
    const advDate = c.advDates.length ? latest(c.advDates) : null;
    const advNat = advFeeds.length ? advFeeds[advFeeds.length - 1].nat : null;
    // Overseas: separate collector, may not exist yet -> null, section hidden
    const overseas = await safeOverseas();
    // Global Tracking (US feed): null -> section simply not rendered
    const globalTracking = await safeGlobal();
    const [news, boxoffice, reviews] = await Promise.all([
      safeEditorial(Data.news),
      safeEditorial(Data.boxoffice),
      safeEditorial(Data.reviews),
    ]);
    renderHome(
      c,
      mode,
      date,
      nat,
      daily,
      dailyDate,
      advFeeds,
      advDate,
      overseas,
      advNat,
      { news, boxoffice, reviews },
      globalTracking,
      await safeComingSoon([]),
    );
  } catch (e) {
    console.error(e);
    mount(fetchError(e));
  }
};

function renderHome(
  c,
  mode,
  date,
  nat,
  daily,
  dailyDate,
  advFeeds,
  advDate,
  overseas,
  advNat,
  editorial,
  globalTracking,
  soonAll,
) {
  // Advance batch minus anything now live in daily, plus the live titles â€”
  // daily cards win. Sorted by gross.
  const merged = mergeFeeds(advFeeds, daily, dailyDate).sort((a, b) => b.mv.gross - a.mv.gross);
  const updated =
    (daily && daily.last_updated) ||
    (advNat && advNat.last_updated) ||
    fmtDate(dailyDate || advDate);

  const topMovies = merged.slice(0, 5);
  const leadMovie = topMovies[0];
  // numbers for the three home cards
  const liveList = (daily && daily.movies) || [];
  const liveCount = liveList.length;
  const liveTop = liveList.slice().sort((a, b) => b.gross - a.gross)[0];
  const advOnly = mergeFeeds(advFeeds, null, null).sort((a, b) => b.mv.gross - a.mv.gross);
  const soonCount = (soonAll || []).filter(
    (m) => !advOnly.some((e) => e.mv.slug === m.slug),
  ).length;
  const gList = (globalTracking && globalTracking.movies) || [];
  const gTop = gList.slice().sort((a, b) => (b.cur.gross || 0) - (a.cur.gross || 0))[0];
  const latestNews = editorial.news[0] || {};
  const latestBoxOffice = editorial.boxoffice[0] || {};
  const latestReview = editorial.reviews[0] || {};
  const featureCards = [
    {
      eyebrow: "Follow live",
      title: "Live Tracking",
      summary: liveCount + " films tracked today, with collections, shows and occupancy.",
      detail: "Open any running film for today's numbers and its full day-by-day history.",
      metric: num(liveCount) + " live",
      action: "Open live tracking",
      path: "/live",
      image: liveTop && posterUrl(liveTop.slug, "bg"),
    },
    {
      eyebrow: "Stay informed",
      title: "Movie News",
      summary: latestNews.title || "Stories, announcements and updates from the world of cinema.",
      detail: "Read the latest movie news and open each story for the full update.",
      metric: "Latest updates",
      action: "Read movie news",
      path: "/news",
      image: latestNews.image || latestNews.poster || null,
    },
    {
      eyebrow: "Follow the numbers",
      title: "Box Office Updates",
      summary:
        latestBoxOffice.title || "Collection reports, milestones and key performance movements.",
      detail: "See the latest box office reports and collection updates in one place.",
      metric: updated ? "Updated " + updated : "Live reports",
      action: "View box office updates",
      path: "/boxoffice",
      image: latestBoxOffice.image || latestBoxOffice.poster || null,
    },
    {
      eyebrow: "What to watch",
      title: "Movie Reviews",
      summary:
        latestReview.movie ||
        latestReview.title ||
        "Ratings and quick reading before you choose your next film.",
      detail: "Browse published reviews and open a title for the complete verdict.",
      metric: "Fresh reviews",
      action: "Explore reviews",
      path: "/reviews",
      image: latestReview.poster || latestReview.image || null,
    },
  ];

  const hero = h(
    "section",
    { class: "hero hero-intelligence" },
    h(
      "div",
      { class: "wrap hero-intelligence-grid" },
      h(
        "div",
        { class: "hero-intelligence-copy" },
        h("h1", null, "Everything Movies,"),
        h("h1", null, h("span", { class: "gold" }, "One Place.")),
        h(
          "p",
          { class: "sub" },
          "Follow real-time collections, advance bookings, movie news, reviews and the performance details that matter.",
        ),
        h(
          "div",
          { class: "hero-value-list" },
          heroValue("globe", "India-wide coverage", "Cities, states and theatres"),
          heroValue("time-past", "Regular updates", "Live and advance tracking"),
          heroValue("chart-histogram", "Performance insights", "Collections, occupancy and sales"),
        ),
        h(
          "div",
          { class: "hero-intelligence-actions" },
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: () =>
                document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" }),
            },
            "Explore tracking",
            icon("arrow-right"),
          ),
          h(
            "button",
            {
              class: "btn ghost",
              type: "button",
              onclick: () => go("/advance"),
            },
            "Advance sales",
          ),
        ),
      ),
      homeFeatureCarousel(featureCards),
    ),
  );

  // ---- The three entry cards; each opens its own listing screen ----
  const hub = hubSection([
    {
      title: "Live Tracking",
      desc: "Daily box office for films running in cinemas, with each film's day-by-day history.",
      path: "/live",
      icon: "time-past",
      live: true,
      bg: liveTop && posterUrl(liveTop.slug, "bg"),
      stats: [
        { v: liveCount, l: "titles" },
        { v: dailyDate ? fmtDate(dailyDate) : "-", l: "updated" },
      ],
      cta: "View live tracking",
    },
    {
      title: "Advance Sales",
      desc: "Pre-release booking numbers for upcoming films, opening day first.",
      path: "/advance",
      icon: "calendar",
      bg: advOnly[0] && posterUrl(advOnly[0].mv.slug, "bg"),
      stats: [
        { v: advOnly.length, l: "on sale" },
        { v: soonCount, l: "coming soon" },
      ],
      cta: "View advance sales",
    },
    {
      title: "Overseas Tracking",
      desc: "Global collections and shows for Indian films released abroad.",
      path: "/overseas",
      icon: "globe",
      live: gList.length > 0,
      bg: gTop && posterUrl(posterSlugOf(gTop), "bg"),
      stats: [{ v: gList.length, l: "titles" }],
      cta: "View overseas tracking",
    },
  ]);

  // social
  const social = h(
    "section",
    { class: "section social" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "eyebrow" }, "Our Social Media Presence"),
      h(
        "h2",
        {
          class: "display",
          style: "font-size:clamp(26px,4vw,40px);margin:8px 0 0",
        },
        "Join the community",
      ),
      h(
        "p",
        { class: "muted", style: "max-width:520px;margin:12px auto 0" },
        "Join our growing community of movie enthusiasts and box office analysts.",
      ),
      h(
        "div",
        { class: "kpis" },
        social_kpi("10M+", "Impressions"),
        social_kpi("1M+", "Engagements"),
        social_kpi("7.8k+", "Followers"),
      ),
      h(
        "a",
        { class: "btn", href: X_URL, target: "_blank", rel: "noopener" },
        "Follow on",
        xIcon(),
      ),
    ),
  );

  mount(page(frag(hero, hub, social)));
}
