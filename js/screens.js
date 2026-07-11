/* ============================================================
   CineBOTrends — screens.js
   home · about · contact · movie details (Advance/Daily/Historical)
   ============================================================ */
(function () {
  "use strict";
  const CBO = window.__CBO;
  const {
    h,
    frag,
    icon,
    inr,
    inrFull,
    pct,
    num,
    grp,
    fmtDate,
    fmtDateLong,
    fmtUpdated,
    fmtReleaseDate,
    Data,
    enc,
    go,
    mount,
    page,
    occMeter,
    kpiCard,
    stateMsg,
    loading,
    fetchError,
    xIcon,
    X_URL,
  } = CBO;

  const S = CBO.Screens;
  const FORMAT_ORDER = [
    "2D",
    "3D",
    "IMAX",
    "4DX",
    "ICE",
    "Dolby Cinema",
    "Others",
  ];

  /* helper: pick the modes/dates we actually have */
  async function ctx() {
    const m = await Data.manifest();
    const advDates = (m.modes.advance && m.modes.advance.dates) || [];
    const dayDates = (m.modes.daily && m.modes.daily.dates) || [];
    return { m, advDates, dayDates };
  }
  const latest = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

  // Merge the advance (pre-sale) and daily (live) feeds into one list keyed by
  // slug — the same slug identifies the same title in both feeds. Once a title
  // starts daily tracking it DROPS its advance card and shows the daily/live
  // card instead ("advance batch removed, live tracking shown").
  // Returns [{ mv, mode, date, live }]; live=true means the daily card won.
  function mergeFeeds(advNat, advDate, daily, dailyDate) {
    const bySlug = new Map();
    if (advNat && advNat.movies)
      for (const mv of advNat.movies)
        bySlug.set(mv.slug, { mv, mode: "advance", date: advDate, live: false });
    if (daily && daily.movies)
      for (const mv of daily.movies)
        bySlug.set(mv.slug, { mv, mode: "daily", date: dailyDate, live: true });
    return [...bySlug.values()];
  }

  // A title still counts as "advance" (pre-sale) only strictly BEFORE its
  // release date. On/after the release date it is live, so it gets the Live
  // Tracking badge instead. If the release date is unknown we keep the advance
  // treatment (the movie is, after all, still in the advance/pre-sale feed).
  function isPreRelease(mv) {
    const rd = (mv && (mv.releaseDate || (mv.meta && mv.meta.releaseDate))) || "";
    const m = String(rd).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return true;
    const release = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(release)) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today < release;
  }

  /* ============================================================
     HOME
     ============================================================ */
  S.home = async function () {
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
      // advance data (new releases on pre-sale) for the live strip
      let advNat = null,
        advDate = null;
      if (c.advDates.length) {
        advDate = latest(c.advDates);
        advNat = mode === "advance" ? nat : null;
        if (!advNat) {
          try {
            advNat = await Data.national("advance", advDate);
          } catch (e) {
            advNat = null;
          }
        }
      }
      renderHome(c, mode, date, nat, daily, dailyDate, advNat, advDate);
    } catch (e) {
      console.error(e);
      mount(fetchError(e));
    }
  };

  function renderHome(c, mode, date, nat, daily, dailyDate, advNat, advDate) {
    // hero ticker — brand message
    const phrases = [
      "You name it, we track it.",
      "All in one platform.",
      "Movie updates",
      "Movie reviews",
      "Pre-sales",
      "Live tracking",
      "Box Office updates",
    ];
    const tkItems = phrases.map((p) =>
      h("span", { class: "tk" }, h("span", { class: "nm" }, p)),
    );
    const ticker = h(
      "div",
      { class: "ticker" },
      h(
        "div",
        { class: "track" },
        ...tkItems,
        ...tkItems.map((n) => n.cloneNode(true)),
        ...tkItems.map((n) => n.cloneNode(true)),
        ...tkItems.map((n) => n.cloneNode(true)),
      ),
    );

    const hero = h(
      "section",
      { class: "hero" },
      h(
        "div",
        { class: "wrap" },
        h(
          "div",
          { class: "bulbs" },
          ...Array.from({ length: 13 }, () => h("i")),
        ),
        h("h1", null, "Box Office ", h("span", { class: "gold" }, "Tracker")),
        h(
          "p",
          { class: "sub" },
          "Track real-time box office performance across India with detailed analytics, live occupancy, collections, ticket sales, theatre-wise reports, city-wise insights and historical trends.",
        ),
      ),
      ticker,
    );

    // ---- All Movies preview (top 5; full list on the dedicated page) ----
    // Advance batch minus anything now live in daily, plus the live titles —
    // daily cards win. Sorted by gross.
    const merged = mergeFeeds(advNat, advDate, daily, dailyDate).sort(
      (a, b) => b.mv.gross - a.mv.gross,
    );
    const topMovies = merged.slice(0, 5);
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
    // Unreleased titles on advance sale lead the strip (Advance Tracking badge).
    // Once a title's release date arrives it is live: its Advance badge is
    // dropped and it appears once under the daily feed with the Live Tracking
    // badge. Films already running show the Live Tracking badge.
    const liveSlugs = new Set(
      (daily && daily.movies ? daily.movies : []).map((mv) => mv.slug),
    );
    const advTop =
      advNat && advNat.movies && advNat.movies.length
        ? advNat.movies
            .filter((mv) => isPreRelease(mv) && !liveSlugs.has(mv.slug))
            .slice()
            .sort((a, b) => b.gross - a.gross)
            .slice(0, 3)
        : [];
    const advSlugs = new Set(advTop.map((mv) => mv.slug));
    const dayTop =
      daily && daily.movies && daily.movies.length
        ? daily.movies
            .filter((mv) => !advSlugs.has(mv.slug))
            .slice()
            .sort((a, b) => b.gross - a.gross)
            .slice(0, 5)
        : [];
    let liveSection = null;
    if (advTop.length || dayTop.length) {
      const updated =
        (daily && daily.last_updated) ||
        (advNat && advNat.last_updated) ||
        fmtDate(dailyDate || advDate);
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
            ...advTop.map((mv) =>
              movieCard(mv, "advance", advDate, { live: true, advance: true }),
            ),
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
          social_kpi("17.9k+", "Followers"),
        ),
        h(
          "a",
          { class: "btn", href: X_URL, target: "_blank", rel: "noopener" },
          "Follow on",
          xIcon(),
        ),
      ),
    );

    mount(page(frag(hero, liveSection, moviesSection, social)));
  }

  // ---- Dedicated All Movies page (#/movies) with full list + filters ----
  S.movies = async function () {
    mount(page(h("div", { class: "wrap" }, loading())));
    try {
      const c = await ctx();
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
      const advDate = c.advDates.length ? latest(c.advDates) : null;
      const dailyDate = c.dayDates.length ? latest(c.dayDates) : null;
      let advNat = null,
        daily = null;
      if (advDate) {
        try {
          advNat = await Data.national("advance", advDate);
        } catch (e) {
          advNat = null;
        }
      }
      if (dailyDate) {
        try {
          daily = await Data.national("daily", dailyDate);
        } catch (e) {
          daily = null;
        }
      }
      renderAllMovies(c, advNat, advDate, daily, dailyDate);
    } catch (e) {
      console.error(e);
      mount(fetchError(e));
    }
  };

  function renderAllMovies(c, advNat, advDate, daily, dailyDate) {
    // Advance batch with live titles swapped in (daily wins); see mergeFeeds.
    const entries = mergeFeeds(advNat, advDate, daily, dailyDate);
    const movies = entries.map((e) => e.mv);
    const langs = [...new Set(movies.flatMap((m) => m.languages))].sort();
    const fmts = FORMAT_ORDER.filter((f) =>
      movies.some((m) => m.formats.includes(f)),
    );
    const st = { q: "", lang: "", fmt: "", sort: "gross" };

    const grid = h("div", { class: "movie-grid", id: "grid" });
    function paint() {
      let list = entries.filter(({ mv: m }) => {
        if (st.q && !m.title.toLowerCase().includes(st.q.toLowerCase()))
          return false;
        if (st.lang && !m.languages.includes(st.lang)) return false;
        if (st.fmt && !m.formats.includes(st.fmt)) return false;
        return true;
      });
      const key = st.sort;
      list = list
        .slice()
        .sort((a, b) =>
          key === "occupancy"
            ? b.mv.occupancy - a.mv.occupancy
            : key === "shows"
              ? b.mv.shows - a.mv.shows
              : b.mv.gross - a.mv.gross,
        );
      if (!list.length) {
        grid.replaceChildren(
          h(
            "div",
            { style: "grid-column:1/-1" },
            stateMsg("search", "No movies match", "Try clearing a filter."),
          ),
        );
        return;
      }
      grid.replaceChildren(
        ...list.map((e) => movieCard(e.mv, e.mode, e.date, { advance: !e.live })),
      );
    }

    const searchInput = h("input", {
      type: "search",
      placeholder: "Search movies",
      oninput: (e) => {
        st.q = e.target.value;
        paint();
      },
    });
    const sel = (label, opts, on) =>
      h(
        "label",
        { class: "field" },
        icon(label[1]),
        h(
          "select",
          {
            "aria-label": label[0],
            onchange: (e) => {
              on(e.target.value);
              paint();
            },
          },
          h("option", { value: "" }, label[0]),
          ...opts.map((o) => h("option", { value: o }, o)),
        ),
      );

    const filters = h(
      "div",
      { class: "filters" },
      h("label", { class: "field" }, icon("search"), searchInput),
      sel(["All languages", "comment"], langs, (v) => (st.lang = v)),
      sel(["All formats", "film"], fmts, (v) => (st.fmt = v)),
      sel(
        ["Sort: Gross", "sort-amount-down"],
        ["gross", "occupancy", "shows"].map(cap),
        (v) => (st.sort = v.toLowerCase()),
      ),
    );

    const section = h(
      "section",
      { class: "section" },
      h(
        "div",
        { class: "wrap" },
        h(
          "div",
          { class: "back-bar" },
          h(
            "div",
            { class: "crumb" },
            h("a", { href: "#/home" }, "Home"),
            icon("angle-right"),
            h("span", null, "All Movies"),
          ),
        ),
        h(
          "div",
          { class: "section-head" },
          h(
            "div",
            null,
            h(
              "div",
              { class: "eyebrow" },
              "Nationwide · " +
                (advNat && daily
                  ? "Advance + Live"
                  : daily
                    ? c.m.modes.daily.label
                    : c.m.modes.advance.label),
            ),
            h("h2", null, "All Movies"),
          ),
          h(
            "div",
            { class: "meta" },
            "Updated " +
              ((daily && daily.last_updated) ||
                (advNat && advNat.last_updated) ||
                fmtDate(dailyDate || advDate)) +
              " · " +
              movies.length +
              " titles",
          ),
        ),
        filters,
        h("div", { style: "height:18px" }),
        grid,
      ),
    );

    mount(page(section));
    paint();
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function social_kpi(n, l) {
    return h(
      "div",
      { class: "kpi" },
      h("div", { class: "n" }, n),
      h("div", { class: "l" }, l),
    );
  }

  function posterEl(title, poster) {
    const initials = title
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();
    const el = h("div", { class: "poster" }, h("div", { class: "reel" }));
    const initial = h("div", { class: "initial" }, initials || "★");
    const url = poster && poster.thumb;
    if (url) {
      const img = h("img", {
        class: "poster-img",
        loading: "lazy",
        alt: title,
        src: url,
      });
      img.addEventListener("error", () => {
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

  function movieCard(mv, mode, date, opts) {
    opts = opts || {};
    const poster = posterEl(mv.title, mv.poster);
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
          mv.languages.join(" · ") +
            (mv.formats.length ? "  •  " + mv.formats.join("/") : ""),
        ),
        (mv.genres && mv.genres.length) || mv.certification || mv.runTime
          ? h(
              "div",
              { class: "cardmeta" },
              mv.genres && mv.genres.length
                ? h("span", { class: "g" }, mv.genres.slice(0, 2).join(", "))
                : null,
              mv.certification
                ? h("span", { class: "cert" }, mv.certification)
                : null,
              mv.runTime ? h("span", { class: "rt" }, mv.runTime) : null,
            )
          : null,
        mv.gross != null
          ? h(
              "div",
              { class: "card-gross" },
              h(
                "span",
                { class: "cg-label" },
                mode === "daily" ? "Today's Gross" : "Gross",
              ),
              h("span", { class: "cg-val" }, inr(mv.gross || 0)),
            )
          : null,
        mv.eventCode
          ? h("div", { class: "evcode" }, icon("ticket"), mv.eventCode)
          : null,
      ),
    );
  }
  function kv(k, v, gold) {
    return h(
      "div",
      null,
      h("div", { class: "k" }, k),
      h("div", { class: "v" + (gold ? " gold" : "") }, v),
    );
  }

  /* ============================================================
     STATIC PAGES
     ============================================================ */
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

  S.news = function (p) {
    editorialScreen(p, {
      eyebrow: "Movie News",
      title: "Movie News",
      label: "news",
      fetchFn: Data.news,
      card: (it) =>
        h(
          "a",
          { class: "ed-card", href: "#/news/" + encodeURIComponent(it.slug) },
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
          h("div", { style: "max-width:680px" }, ...bodyBlocks(it.body)),
          h("a", { href: "#/news", class: "ed-back" }, "\u2190 All news"),
        ),
    });
  };

  S.reviews = function (p) {
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
            href: "#/reviews/" + encodeURIComponent(it.slug),
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
          h("div", { style: "max-width:680px" }, ...bodyBlocks(it.body)),
          h("a", { href: "#/reviews", class: "ed-back" }, "\u2190 All reviews"),
        ),
    });
  };

  S.boxoffice = function (p) {
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
            href: "#/boxoffice/" + encodeURIComponent(it.slug),
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
          h("div", { style: "max-width:680px" }, ...bodyBlocks(it.body)),
          h(
            "a",
            { href: "#/boxoffice", class: "ed-back" },
            "\u2190 All updates",
          ),
        ),
    });
  };

  S.about = function () {
    mount(
      page(
        h(
          "div",
          { class: "wrap section" },
          h("div", { class: "eyebrow" }, "About"),
          h(
            "h2",
            {
              class: "display",
              style: "font-size:clamp(28px,5vw,46px);margin:8px 0 18px",
            },
            "About CineBOTrends",
          ),
          h(
            "p",
            {
              class: "muted",
              style: "max-width:640px;font-size:15px;line-height:1.7",
            },
            "CineBOTrends is a real-time box office intelligence dashboard for Indian cinema. It tracks advance bookings and daily collections across thousands of theatres, surfacing live occupancy, ticket sales, city and state breakdowns, theatre-level show timings and historical trends — all refreshed through the day from our automated data collector.",
          ),
          h(
            "p",
            {
              class: "muted",
              style: "max-width:640px;font-size:14px;margin-top:16px",
            },
            "Data is provided for informational and analytical purposes only.",
          ),
        ),
      ),
    );
  };
  S.contact = function () {
    mount(
      page(
        h(
          "div",
          { class: "wrap section" },
          h("div", { class: "eyebrow" }, "Contact"),
          h(
            "h2",
            {
              class: "display",
              style: "font-size:clamp(28px,5vw,46px);margin:8px 0 18px",
            },
            "Get in touch",
          ),
          h(
            "div",
            { class: "meta-grid", style: "max-width:560px" },
            mi("Support Email", "support@cinebotrends.example"),
            mi("X / Twitter", "@cinebotrends"),
            mi("Telegram", "t.me/cinebotrends"),
            mi("Instagram", "@cinebotrends"),
          ),
        ),
      ),
    );
  };
  function mi(k, v, dim) {
    return h(
      "div",
      { class: "mi" },
      h("div", { class: "k" }, k),
      h("div", { class: "v" + (dim ? " dim" : "") }, v),
    );
  }

  /* ============================================================
     MOVIE DETAILS
     ============================================================ */
  S.movie = async function (p) {
    const slug = p[1];
    // parse tokens after slug
    let tab = null,
      date = null,
      stateName = null,
      cityName = null;
    for (let i = 2; i < p.length; i++) {
      const t = p[i];
      if (["advance", "daily", "historical"].includes(t)) tab = t;
      else if (/^\d{8}$/.test(t)) date = t;
      else if (t === "state") stateName = p[++i];
      else if (t === "city") cityName = p[++i];
    }
    mount(page(h("div", { class: "wrap" }, loading())));
    try {
      const c = await ctx();
      const hasAdv = c.advDates.length,
        hasDay = c.dayDates.length;
      if (!tab) tab = hasDay ? "daily" : hasAdv ? "advance" : "historical"; // spec default = Daily
      // resolve mode + date
      let mode = tab === "historical" ? (hasAdv ? "advance" : "daily") : tab;
      let dates = mode === "advance" ? c.advDates : c.dayDates;
      if (tab !== "historical" && (!date || !dates.includes(date)))
        date = latest(dates);

      // load movie (need a representative date for hero/meta even on historical)
      const metaDate = date || latest(hasAdv ? c.advDates : c.dayDates);
      let movie = null,
        hist = null;
      if (tab === "historical") {
        try {
          hist = await Data.history(mode, slug);
        } catch (e) {
          hist = null;
        }
        try {
          movie = await Data.movie(mode, metaDate, slug);
        } catch (e) {
          movie = null;
        }
      } else if (dates.length) {
        try {
          movie = await Data.movie(mode, date, slug);
        } catch (e) {
          movie = null;
        }
      } else {
        try {
          movie = await Data.movie(
            hasAdv ? "advance" : "daily",
            metaDate,
            slug,
          );
        } catch (e) {
          movie = null;
        }
      }

      renderMovie({
        c,
        slug,
        tab,
        mode,
        date,
        dates,
        stateName,
        cityName,
        movie,
        hist,
      });
    } catch (e) {
      console.error(e);
      mount(fetchError(e));
    }
  };

  function renderMovie(s) {
    const {
      c,
      slug,
      tab,
      mode,
      date,
      dates,
      stateName,
      cityName,
      movie,
      hist,
    } = s;
    const title = (movie && movie.title) || (hist && hist.title) || slug;

    // breadcrumb
    const crumb = h(
      "div",
      { class: "crumb" },
      h("a", { href: "#/home" }, "Home"),
      icon("angle-right"),
      h(
        "a",
        {
          href: "#/home",
          onclick: (e) => {
            e.preventDefault();
            go("/home");
          },
        },
        "Movies",
      ),
      icon("angle-right"),
      h("a", { href: `#/movie/${enc(slug)}` }, title),
      stateName &&
        frag(
          icon("angle-right"),
          h(
            "a",
            {
              href: `#/movie/${enc(slug)}/${tab}/${date}/state/${enc(stateName)}`,
            },
            stateName,
          ),
        ),
      cityName && frag(icon("angle-right"), h("span", null, cityName)),
    );

    // movie hero
    const mvPoster = movie && movie.poster;
    const meta = (movie && movie.meta) || {};
    const poster = posterEl(title, mvPoster);
    const langs =
      (meta.languages && meta.languages.length
        ? meta.languages
        : movie && movie.languages) || [];
    const fmts = (movie && movie.formats) || [];
    const genres = meta.genres || [];
    const hero = h(
      "div",
      { class: "movie-hero" + (mvPoster && mvPoster.bg ? " has-bg" : "") },
      mvPoster && mvPoster.bg
        ? h("div", {
            class: "mh-bg",
            style: `background-image:url("${mvPoster.bg}")`,
          })
        : null,
      poster,
      h(
        "div",
        { class: "mh-info" },
        h(
          "div",
          { class: "eyebrow" },
          c.m.modes[mode] ? c.m.modes[mode].label + " · India" : "India",
        ),
        h("h1", null, title),
        h(
          "div",
          { class: "chips" },
          ...langs.map((l) => h("span", { class: "chip" }, l)),
          ...fmts.map((f) => h("span", { class: "chip plain" }, f)),
          meta.likes
            ? h(
                "span",
                { class: "chip solid" },
                icon("heart"),
                " " + meta.likes,
              )
            : null,
        ),
        h(
          "div",
          { class: "meta-grid" },
          mi(
            "Genre",
            genres.length ? genres.join(", ") : "Not in dataset",
            !genres.length,
          ),
          mi("Runtime", meta.runTime || "Not in dataset", !meta.runTime),
          mi(
            "Certification",
            meta.certification || "Not in dataset",
            !meta.certification,
          ),
          mi("Languages", langs.join(", ") || "—"),
          mi("Formats", fmts.join(", ") || "—"),
        ),
      ),
      movie && movie.last_updated
        ? h(
            "div",
            { class: "mh-updated" },
            "Updated " + fmtUpdated(movie.last_updated),
          )
        : null,
    );

    // tabs
    const mkTab = (id, label) =>
      h(
        "button",
        {
          class: "tab" + (tab === id ? " on" : ""),
          onclick: () => go(`/movie/${enc(slug)}/${id}`),
        },
        label,
      );
    const tabs = h(
      "div",
      { class: "tabs" },
      mkTab("advance", "Advance"),
      mkTab("daily", "Daily"),
      mkTab("historical", "Historical"),
    );

    const body = h("div", { class: "tab-body", id: "tabbody" });

    mount(
      page(
        h(
          "div",
          { class: "wrap" },
          h("div", { class: "back-bar" }, crumb),
          hero,
          tabs,
          body,
        ),
      ),
    );

    // fill tab body
    if (tab === "historical") return renderHistorical(body, hist, title);
    if (!dates.length)
      return body.replaceChildren(
        stateMsg(
          "calendar",
          (mode === "daily" ? "Daily" : "Advance") + " tracking hasn't started",
          mode === "daily"
            ? "Daily collections appear here once the collector runs in daily mode."
            : "No advance data is available yet.",
        ),
      );
    if (!movie)
      return body.replaceChildren(
        stateMsg(
          "film",
          "Not tracked",
          "This title has no detail for the selected date.",
        ),
      );

    renderTrackTab(body, s, movie);
  }

  /* ---- Advance / Daily tab ---- */
  function renderTrackTab(body, s, movie) {
    const { slug, tab, date, dates, stateName, cityName } = s;
    const parts = [];

    // date chips
    if (dates.length > 1) {
      parts.push(
        h(
          "div",
          { class: "dates" },
          ...dates.map((d) =>
            h(
              "button",
              {
                class: "datechip" + (d === date ? " on" : ""),
                onclick: () => go(`/movie/${enc(slug)}/${tab}/${d}`),
              },
              fmtDate(d),
            ),
          ),
        ),
      );
    }

    // drill: city details
    if (stateName && cityName) {
      parts.push(cityDetails(s, movie));
      body.replaceChildren(...parts);
      return;
    }
    // drill: state details
    if (stateName) {
      parts.push(stateDetails(s, movie));
      body.replaceChildren(...parts);
      return;
    }

    // ---- main tab view ----
    const k = movie.kpi;
    parts.push(
      h(
        "div",
        { class: "kpi-grid" },
        kpiCard("Total Cities", num(k.cities), k.states + " states", "marker"),
        kpiCard(
          "Booked Gross",
          inr(k.gross),
          "max " + inr(maxGross(movie)),
          "indian-rupee-sign",
          true,
        ),
        kpiCard("Tickets Sold", num(k.sold), num(k.seats) + " seats", "ticket"),
        kpiCard(
          "Total Shows",
          num(k.shows),
          num(k.theatres) + " theatres",
          "clapperboard-play",
        ),
      ),
    );
    parts.push(
      h(
        "div",
        { class: "kpi-grid", style: "margin-top:14px" },
        kpiCard("Occupancy", pct(k.occupancy), "weighted avg", "chart-pie"),
        kpiCard("Fast Filling", num(k.fastfilling), "shows 50–98%", "flame"),
        kpiCard("Houseful", num(k.housefull), "shows ≥ 98%", "trophy", true),
        kpiCard("Theatres", num(k.theatres), "nationwide", "building"),
      ),
    );
    parts.push(
      h(
        "div",
        { class: "updated" },
        icon("time-past"),
        "Updated " + (movie.last_updated || fmtDateLong(date)),
      ),
    );

    // Top 20 cities
    const cities = flatCities(movie).slice(0, 20);
    parts.push(
      block(
        "Top 20 Cities",
        "Ranked by booked gross — tap a city to drill in",
        citiesTable(cities, slug, tab, date),
      ),
    );

    // State cards
    parts.push(
      block(
        "States",
        movie.states.length + " states tracked",
        h(
          "div",
          { class: "state-grid" },
          ...movie.states.map((st) =>
            h(
              "div",
              {
                class: "state-card",
                role: "button",
                tabindex: "0",
                onclick: () =>
                  go(
                    `/movie/${enc(slug)}/${tab}/${date}/state/${enc(st.state)}`,
                  ),
                onkeydown: (e) => {
                  if (e.key === "Enter")
                    go(
                      `/movie/${enc(slug)}/${tab}/${date}/state/${enc(st.state)}`,
                    );
                },
              },
              h("div", { class: "sn" }, st.state, icon("angle-right")),
              h("div", { class: "sg" }, inr(st.gross)),
              h(
                "div",
                { class: "srow" },
                sk("Tickets", num(st.sold)),
                sk("Shows", num(st.shows)),
                sk("Theatres", num(st.theatres)),
                sk("Occupancy", pct(st.occupancy)),
              ),
            ),
          ),
        ),
      ),
    );

    // Format summary
    parts.push(
      block(
        "Format Summary",
        "Collections by presentation format",
        formatGrid(movie.formatSummary),
      ),
    );

    body.replaceChildren(...parts);
  }

  function maxGross(movie) {
    let mg = 0;
    for (const st of movie.states)
      for (const c of st.cityList)
        for (const t of c.theatreList)
          for (const sh of t.showTimings) mg += sh.maxGross || 0;
    return mg;
  }
  function flatCities(movie) {
    const out = [];
    for (const st of movie.states)
      for (const c of st.cityList) out.push({ ...c, state: st.state });
    out.sort((a, b) => b.gross - a.gross);
    return out;
  }

  function sk(k, v) {
    return frag(h("span", { class: "k" }, k), h("span", { class: "v" }, v));
  }
  function block(title, hint, content) {
    return h(
      "div",
      { class: "block" },
      h("h3", null, title),
      hint && h("p", { class: "hint" }, hint),
      content,
    );
  }

  function citiesTable(cities, slug, tab, date, showState) {
    const rows = cities.map((ct, i) =>
      h(
        "tr",
        {
          class: "clickable",
          onclick: () =>
            go(
              `/movie/${enc(slug)}/${tab}/${date}/state/${enc(ct.state)}/city/${enc(ct.city)}`,
            ),
        },
        h("td", { class: "rank" + (i < 3 ? " top" : "") }, i + 1),
        h(
          "td",
          null,
          h("div", { class: "city-nm" }, ct.city),
          showState !== false ? h("div", { class: "sub" }, ct.state) : null,
        ),
        h("td", { class: "num" }, num(ct.sold)),
        h("td", { class: "num" }, num(ct.shows)),
        h("td", { class: "num gold" }, inr(ct.gross)),
        h("td", null, occMeter(ct.occupancy)),
      ),
    );
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "bo" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "#"),
            h("th", null, "City"),
            h("th", { class: "num" }, "Sold"),
            h("th", { class: "num" }, "Shows"),
            h("th", { class: "num" }, "Gross"),
            h("th", null, "Occupancy"),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    );
  }

  function formatGrid(fmts) {
    const ordered = fmts
      .slice()
      .sort(
        (a, b) =>
          FORMAT_ORDER.indexOf(a.format) +
          99 * (FORMAT_ORDER.indexOf(a.format) < 0) -
          (FORMAT_ORDER.indexOf(b.format) +
            99 * (FORMAT_ORDER.indexOf(b.format) < 0)),
      );
    const rows = ordered.map((f) =>
      h(
        "tr",
        null,
        h("td", null, h("span", { class: "tag" }, f.format)),
        h("td", { class: "num gold" }, inr(f.gross)),
        h("td", { class: "num" }, num(f.sold)),
        h("td", { class: "num" }, num(f.shows)),
        h("td", null, occMeter(f.occupancy)),
      ),
    );
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "bo" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Format"),
            h("th", { class: "num" }, "Gross"),
            h("th", { class: "num" }, "Tickets"),
            h("th", { class: "num" }, "Shows"),
            h("th", null, "Occupancy"),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    );
  }

  /* ---- State details ---- */
  function stateDetails(s, movie) {
    const { slug, tab, date, stateName } = s;
    const st = movie.states.find((x) => x.state === stateName);
    if (!st)
      return stateMsg(
        "marker",
        "State not found",
        "It may not be tracked for this date.",
      );
    const cities = st.cityList.map((c) => ({ ...c, state: st.state }));
    return frag(
      h(
        "div",
        { class: "kpi-grid", style: "margin-top:4px" },
        kpiCard("Gross", inr(st.gross), st.state, "indian-rupee-sign", true),
        kpiCard("Tickets", num(st.sold), "sold", "ticket"),
        kpiCard(
          "Shows",
          num(st.shows),
          num(st.theatres) + " theatres",
          "clapperboard-play",
        ),
        kpiCard(
          "Occupancy",
          pct(st.occupancy),
          st.cities + " cities",
          "chart-pie",
        ),
      ),
      block(
        "Top Cities",
        "Tap a city for theatre-level detail",
        citiesTable(cities, slug, tab, date, false),
      ),
    );
  }

  /* ---- City details (theatres + show timings) ---- */
  function cityDetails(s, movie) {
    const { slug, stateName, cityName } = s;
    const st = movie.states.find((x) => x.state === stateName);
    const ct = st && st.cityList.find((x) => x.city === cityName);
    if (!ct)
      return stateMsg(
        "building",
        "City not found",
        "It may not be tracked for this date.",
      );

    const theatres = ct.theatreList.map((t) => theatreAccordion(t));
    // city-level format summary
    const fmtAcc = {};
    for (const t of ct.theatreList)
      for (const sh of t.showTimings) {
        const f =
          fmtAcc[sh.format] ||
          (fmtAcc[sh.format] = {
            format: sh.format,
            gross: 0,
            sold: 0,
            shows: 0,
            seats: 0,
          });
        f.gross += sh.estimatedCollection;
        f.sold += sh.sold;
        f.shows += 1;
        f.seats += sh.totalSeats;
      }
    const fmtList = Object.values(fmtAcc).map((f) => ({
      ...f,
      occupancy: f.seats ? (f.sold / f.seats) * 100 : 0,
    }));

    return frag(
      h(
        "div",
        { class: "kpi-grid", style: "margin-top:4px" },
        kpiCard("Theatres", num(ct.theatres), ct.city, "building"),
        kpiCard("Gross", inr(ct.gross), "booked", "indian-rupee-sign", true),
        kpiCard(
          "Tickets",
          num(ct.sold) + " / " + num(ct.seats),
          "sold / capacity",
          "ticket",
        ),
        kpiCard(
          "Occupancy",
          pct(ct.occupancy),
          num(ct.shows) + " shows",
          "chart-pie",
        ),
      ),
      block(
        "Theatres",
        "Tap a theatre to see show timings",
        h("div", null, ...theatres),
      ),
      block("Format Summary", "Within " + ct.city, formatGrid(fmtList)),
    );
  }

  function theatreAccordion(t) {
    const wrap = h("div", { class: "theatre" });
    const head = h(
      "div",
      {
        class: "th-head",
        onclick: () => wrap.classList.toggle("open"),
        role: "button",
        tabindex: "0",
        onkeydown: (e) => {
          if (e.key === "Enter") wrap.classList.toggle("open");
        },
      },
      h(
        "div",
        null,
        h("div", { class: "tname" }, t.venue),
        h(
          "div",
          { class: "tsub" },
          [t.chain, t.address].filter(Boolean).join(" · ").slice(0, 80),
        ),
      ),
      h(
        "div",
        { class: "tnums" },
        h(
          "div",
          null,
          h("div", { class: "k" }, "Shows"),
          h("div", { class: "v" }, num(t.shows)),
        ),
        h(
          "div",
          null,
          h("div", { class: "k" }, "Sold"),
          h("div", { class: "v" }, num(t.sold)),
        ),
        h(
          "div",
          null,
          h("div", { class: "k" }, "Gross"),
          h("div", { class: "v gold" }, inr(t.gross)),
        ),
        h(
          "div",
          null,
          h("div", { class: "k" }, "Occ"),
          h("div", { class: "v" }, pct(t.occupancy)),
        ),
      ),
      icon("angle-right", "caret"),
    );

    const rows = t.showTimings.map((sh) =>
      h(
        "tr",
        null,
        h("td", { class: "mono" }, sh.time || "—"),
        h("td", null, sh.audi || "—"),
        h("td", null, h("span", { class: "tag" }, sh.format)),
        h("td", { class: "num" }, num(sh.totalSeats)),
        h("td", { class: "num" }, num(sh.sold)),
        h("td", { class: "num" }, num(sh.available)),
        h("td", null, occMeter(sh.occupancy)),
        h("td", { class: "num gold" }, inr(sh.estimatedCollection)),
        h("td", { class: "num" }, inr(sh.maxGross)),
        h(
          "td",
          null,
          sh.housefull
            ? h("span", { class: "pill hf" }, "Houseful")
            : sh.fastfilling
              ? h("span", { class: "pill ff" }, "Fast")
              : h("span", { class: "muted" }, "—"),
        ),
      ),
    );
    const tableBody = h(
      "div",
      { class: "th-body" },
      h(
        "table",
        { class: "bo" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Time"),
            h("th", null, "Screen"),
            h("th", null, "Format"),
            h("th", { class: "num" }, "Seats"),
            h("th", { class: "num" }, "Sold"),
            h("th", { class: "num" }, "Avail"),
            h("th", null, "Occupancy"),
            h("th", { class: "num" }, "Est. Coll."),
            h("th", { class: "num" }, "Max Gross"),
            h("th", null, "Status"),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    );

    wrap.append(head, tableBody);
    return wrap;
  }

  /* ---- Historical tab ---- */
  function renderHistorical(body, hist, title) {
    if (!hist)
      return body.replaceChildren(
        stateMsg(
          "time-past",
          "No history yet",
          "Historical tables build up as the collector runs across multiple days.",
        ),
      );
    const parts = [];
    if (hist.last_updated)
      parts.push(
        h(
          "div",
          { class: "updated" },
          icon("time-past"),
          "Updated " + hist.last_updated,
        ),
      );

    // Table 1 — day-wise
    parts.push(
      block(
        "Day-wise Performance",
        hist.days.length + " day(s) tracked",
        simpleTable(
          ["Day", "Date", "Gross", "Tickets", "Shows", "Occupancy"],
          hist.days.map((d) => [
            d.day,
            fmtDate(d.date),
            inr(d.gross),
            num(d.sold),
            num(d.shows),
            occMeter(d.occupancy),
          ]),
          [0, 0, 1, 1, 1, 2],
        ),
      ),
    );

    // Table 2 — city-wise
    parts.push(
      block(
        "City-wise Performance",
        "Top cities by gross",
        simpleTable(
          ["City", "State", "Gross", "Tickets", "Shows", "Avg Occupancy"],
          hist.cities.map((c) => [
            c.city,
            c.state,
            inr(c.gross),
            num(c.sold),
            num(c.shows),
            occMeter(c.occupancy),
          ]),
          [0, 0, 1, 1, 1, 2],
        ),
      ),
    );

    // Table 3 — state-wise
    parts.push(
      block(
        "State-wise Performance",
        "All states",
        simpleTable(
          ["State", "Gross", "Tickets", "Shows", "Theatres", "Occupancy"],
          hist.states.map((s) => [
            s.state,
            inr(s.gross),
            num(s.sold),
            num(s.shows),
            num(s.theatres),
            occMeter(s.occupancy),
          ]),
          [0, 1, 1, 1, 1, 2],
        ),
      ),
    );

    // Table 4 — format-wise
    parts.push(
      block(
        "Format-wise Performance",
        "By presentation format",
        simpleTable(
          ["Format", "Gross", "Tickets", "Shows", "Occupancy"],
          hist.formats.map((f) => [
            f.format,
            inr(f.gross),
            num(f.sold),
            num(f.shows),
            occMeter(f.occupancy),
          ]),
          [0, 1, 1, 1, 2],
        ),
      ),
    );

    body.replaceChildren(...parts);
  }

  // align: 0=left, 1=right-num, 2=plain(node)
  function simpleTable(heads, rows, align) {
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "bo" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...heads.map((hd, i) =>
              h("th", { class: align[i] === 1 ? "num" : "" }, hd),
            ),
          ),
        ),
        h(
          "tbody",
          null,
          ...(rows.length
            ? rows.map((r) =>
                h(
                  "tr",
                  null,
                  ...r.map((cell, i) =>
                    h(
                      "td",
                      {
                        class:
                          align[i] === 1
                            ? "num mono"
                            : i === 2 && align[i] === 1
                              ? "num gold"
                              : "",
                      },
                      cell,
                    ),
                  ),
                ),
              )
            : [
                h(
                  "tr",
                  null,
                  h(
                    "td",
                    {
                      colspan: heads.length,
                      class: "muted",
                      style: "text-align:center;padding:30px",
                    },
                    "No data",
                  ),
                ),
              ]),
        ),
      ),
    );
  }

  /* ---- boot ---- */
  CBO.boot();
})();
