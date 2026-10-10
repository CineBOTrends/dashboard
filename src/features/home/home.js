import { posterUrl } from "../../core/poster.js";
import { mount, page, xIcon } from "../../components/chrome.js";
import { movieCard } from "../../components/movieCard.js";
import { fetchError, loading, stateMsg } from "../../components/states.js";
import { X_URL } from "../../core/config.js";
import { frag, h, icon } from "../../core/dom.js";
import { ctx, latest, loadAdvanceFeeds, mergeFeeds } from "../../core/feeds.js";
import { fmtDate, num } from "../../core/format.js";
import { go } from "../../core/router.js";
import { Data } from "../../core/store.js";

import { heroValue, homeFeatureCarousel, social_kpi } from "./featureCarousel.js";
import { globalSection, safeGlobal } from "./globalStrip.js";
import { overseasSection, safeEditorial, safeOverseas } from "./overseas.js";

export const home = async function () {
  mount(page(h("div", { class: "wrap" }, loading())));
  let c, nat;
  try {
    c = await ctx();
    const mode = c.advDates.length
      ? "advance"
      : c.dayDates.length
        ? "daily"
        : null;
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
) {
  // Advance batch minus anything now live in daily, plus the live titles â€”
  // daily cards win. Sorted by gross.
  const merged = mergeFeeds(advFeeds, daily, dailyDate).sort(
    (a, b) => b.mv.gross - a.mv.gross,
  );
  const updated =
    (daily && daily.last_updated) ||
    (advNat && advNat.last_updated) ||
    fmtDate(dailyDate || advDate);

  const topMovies = merged.slice(0, 5);
  const leadMovie = topMovies[0];
  const latestNews = editorial.news[0] || {};
  const latestBoxOffice = editorial.boxoffice[0] || {};
  const latestReview = editorial.reviews[0] || {};
  const featureCards = [
    {
      eyebrow: "Discover",
      title: "All Movies",
      summary:
        merged.length +
        " titles across live tracking and advance booking, ready to explore.",
      detail:
        "Browse every title, filter by language or format, and open its complete performance report.",
      metric: num(merged.length) + " tracked",
      action: "Browse all movies",
      path: "/movies",
      image:
        leadMovie && posterUrl(leadMovie.mv.slug, "bg"),
    },
    {
      eyebrow: "Stay informed",
      title: "Movie News",
      summary:
        latestNews.title ||
        "Stories, announcements and updates from the world of cinema.",
      detail:
        "Read the latest movie news and open each story for the full update.",
      metric: "Latest updates",
      action: "Read movie news",
      path: "/news",
      image: latestNews.image || latestNews.poster || null,
    },
    {
      eyebrow: "Follow the numbers",
      title: "Box Office Updates",
      summary:
        latestBoxOffice.title ||
        "Collection reports, milestones and key performance movements.",
      detail:
        "See the latest box office reports and collection updates in one place.",
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
      detail:
        "Browse published reviews and open a title for the complete verdict.",
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
          heroValue(
            "globe",
            "India-wide coverage",
            "Cities, states and theatres",
          ),
          heroValue(
            "time-past",
            "Regular updates",
            "Live and advance tracking",
          ),
          heroValue(
            "chart-histogram",
            "Performance insights",
            "Collections, occupancy and sales",
          ),
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
                document
                  .getElementById("live")
                  ?.scrollIntoView({ behavior: "smooth" }),
            },
            "Explore live tracking",
            icon("arrow-right"),
          ),
          h(
            "button",
            {
              class: "btn ghost",
              type: "button",
              onclick: () => go("/movies"),
            },
            "Browse movies",
          ),
        ),
      ),
      homeFeatureCarousel(featureCards),
    ),
  );

  // ---- All Movies preview (top 5; full list on the dedicated page) ----
  const grid = h(
    "div",
    { class: "movie-grid" },
    ...topMovies.map((e) =>
      movieCard(e.mv, e.mode, e.date, { advance: !e.live }),
    ),
  );

  const moviesSection = h(
    "section",
    { class: "section", id: "movies" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "section-head" },
        h("div", null, h("h2", null, "All Movies")),
        h(
          "button",
          {
            class: "btn ghost viewall",
            type: "button",
            onclick: () => go("/movies"),
          },
          "View All Movies",
          icon("arrow-right"),
        ),
      ),
      grid,
    ),
  );

  // ---- Live tracking strip ----
  // LIVE = what is actually playing and being tracked today (daily feed only).
  // Advance / pre-sale titles are deliberately NOT shown here.
  const dayTop =
    daily && daily.movies && daily.movies.length
      ? daily.movies
          .slice()
          .sort((a, b) => b.gross - a.gross)
          .slice(0, 8)
      : [];
  let liveSection = null;
  if (dayTop.length) {
    const updated = (daily && daily.last_updated) || fmtDate(dailyDate);
    liveSection = h(
      "section",
      { class: "section", id: "live" },
      h(
        "div",
        { class: "wrap" },
        h(
          "div",
          { class: "section-head" },
          h(
            "div",
            null,
            h(
              "div",
              { class: "eyebrow" },
              h("span", { class: "live-dot" }),
              "Live Box Office Tracking",
            ),
          ),
          h("div", { class: "meta" }, "Updated " + updated),
        ),
        h(
          "div",
          { class: "movie-grid" },
          ...dayTop.map((mv) =>
            movieCard(mv, "daily", dailyDate, { live: true }),
          ),
        ),
      ),
    );
  }

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

  // Global Tracking (US feed) closes the page content, right after All
  // Movies. globalSection() returns null when no manifest is published.
  // Overseas sits directly below Live Box Office Tracking. overseasSection()
  // returns null when there's no data, and frag() skips nulls, so the page is
  // unchanged until the overseas collector starts publishing.
  mount(
    page(
      frag(
        hero,
        liveSection,
        overseasSection(overseas),
        moviesSection,
        globalSection(globalTracking),
        social,
      ),
    ),
  );
}
