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

  // The "daily" feed is presented as TODAY everywhere in the UI. The token
  // itself stays "daily" (routes, data paths, manifest keys).
  const modeLabel = (c, mode) =>
    mode === "daily"
      ? "Today"
      : (c && c.m && c.m.modes[mode] && c.m.modes[mode].label) || "Advance";
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
  // Load EVERY advance date, not just the newest one.
  //
  // Different films open on different days, so each advance date's national.json
  // holds a different set of movies: 23 Jul has the Jana Nayagan releases, 30 Jul
  // has Spider-Man. Reading only latest(advDates) meant every film whose opening
  // day was not the newest date silently disappeared from All Movies — even
  // though its data was published and its movie page worked.
  async function loadAdvanceFeeds(c) {
    const dates = (c.advDates || []).slice().sort(); // oldest -> newest
    const feeds = await Promise.all(
      dates.map(async (d) => {
        try {
          return { nat: await Data.national("advance", d), date: d };
        } catch (e) {
          return null; // date not published
        }
      }),
    );
    return feeds.filter(Boolean);
  }

  function mergeFeeds(advFeeds, daily, dailyDate) {
    const bySlug = new Map();
    // oldest first, so a later date overwrites an earlier one for the same film
    for (const f of advFeeds || []) {
      if (!f || !f.nat || !f.nat.movies) continue;
      for (const mv of f.nat.movies)
        bySlug.set(mv.slug, {
          mv,
          mode: "advance",
          date: f.date,
          live: false,
        });
    }
    // a film that is actually running wins over its advance entry
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
    const rd =
      (mv && (mv.releaseDate || (mv.meta && mv.meta.releaseDate))) || "";
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
      // advance data (new releases on pre-sale) — ALL dates, since films open
      // on different days and each date holds a different set of movies
      const advFeeds = await loadAdvanceFeeds(c);
      const advDate = c.advDates.length ? latest(c.advDates) : null;
      const advNat = advFeeds.length ? advFeeds[advFeeds.length - 1].nat : null;
      // Overseas: separate collector, may not exist yet -> null, section hidden
      const overseas = await safeOverseas();
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
      );
    } catch (e) {
      console.error(e);
      mount(fetchError(e));
    }
  };

  /* ============================================================
     OVERSEAS BOX OFFICE
     Fed by a SEPARATE collector (still in testing), so everything here is
     written defensively: a missing file, a half-written file or a schema that
     drifts must never break the home page. If we can't read usable data the
     section simply does not render — same pattern as liveSection.
     ============================================================ */

  // Never throws. A 404 while the overseas collector is still being built is a
  // normal state, not an error.
  async function safeOverseas() {
    try {
      return normalizeOverseas(await Data.overseas());
    } catch (e) {
      return null; // no file yet, bad JSON, offline — all mean "nothing to show"
    }
  }

  const _num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Pick the first key that's actually present — the collector's field names
  // are not final yet, so accept the obvious synonyms instead of hard-coding one.
  const _pick = (o, keys, dflt) => {
    for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k];
    return dflt;
  };

  function normalizeOverseas(raw) {
    if (!raw) return null;

    // Never render the sample file. If latest.json.sample gets copied to
    // latest.json to try the layout, its _comment marks it as fake — showing
    // invented box-office numbers as real is worse than showing nothing.
    if (raw._comment && /sample/i.test(String(raw._comment))) {
      console.warn("overseas: sample data ignored — publish real figures");
      return null;
    }
    // accept either { movies: [...] } or a bare [...]
    const list = Array.isArray(raw) ? raw : raw.movies || raw.data || [];
    if (!Array.isArray(list) || !list.length) return null;

    const currency = (raw && raw.currency) || "USD";

    const movies = list
      .map((m) => {
        const title = _pick(m, ["title", "name", "movie"], "");
        if (!title) return null;
        const terrRaw =
          _pick(m, ["territories", "countries", "markets"], []) || [];
        const territories = (Array.isArray(terrRaw) ? terrRaw : [])
          .map((t) => ({
            name: _pick(t, ["territory", "country", "market", "name"], "—"),
            gross: _num(_pick(t, ["gross", "grossUsd", "total", "amount"], 0)),
            admissions: _num(
              _pick(t, ["admissions", "admits", "tickets", "sold"], 0),
            ),
            shows: _num(_pick(t, ["shows", "screens", "showCount"], 0)),
          }))
          .sort((a, b) => b.gross - a.gross);

        // movie total, else derived from its territories
        const gross =
          _num(_pick(m, ["gross", "grossUsd", "total", "amount"], 0)) ||
          territories.reduce((a, t) => a + t.gross, 0);

        return {
          slug: _pick(m, ["slug", "id"], null),
          title,
          poster: m.poster || null,
          gross,
          admissions:
            _num(_pick(m, ["admissions", "admits", "tickets", "sold"], 0)) ||
            territories.reduce((a, t) => a + t.admissions, 0),
          shows:
            _num(_pick(m, ["shows", "screens", "showCount"], 0)) ||
            territories.reduce((a, t) => a + t.shows, 0),
          territories,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.gross - a.gross);

    if (!movies.length) return null;
    return {
      updated: _pick(raw, ["updated", "last_updated", "generated"], ""),
      currency,
      movies,
    };
  }

  // Compact money: overseas figures are large and in a foreign currency, so
  // inr()'s lakh/crore scaling would be actively misleading here.
  function money(v, cur) {
    const sym = {
      USD: "$",
      GBP: "£",
      EUR: "€",
      AUD: "A$",
      CAD: "C$",
      AED: "AED ",
    };
    const p = sym[cur] || (cur ? cur + " " : "");
    const n = _num(v);
    if (n >= 1e6) return p + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return p + (n / 1e3).toFixed(1) + "K";
    return p + grp(Math.round(n));
  }

  // Mirrors movieCard() and reuses its classes (.mcard/.poster/.body/.ttl/
  // .langs/.card-gross), so an overseas card is visually identical to a Live
  // Tracking card. It is NOT clickable: there is no overseas detail page yet,
  // and routing to /movie/<slug> would show INDIA figures under an Overseas
  // card. The territory split is shown inline instead.
  function overseasCard(m, currency) {
    const poster = posterEl(m.title, m.poster);
    poster.append(
      h(
        "div",
        { class: "badges" },
        h(
          "span",
          { class: "badge overseastrack" },
          h("span", { class: "live-dot" }),
          "Overseas",
        ),
        m.territories.length
          ? h(
              "span",
              { class: "badge nation" },
              icon("globe"),
              " " +
                m.territories.length +
                (m.territories.length === 1 ? " territory" : " territories"),
            )
          : null,
      ),
    );

    // top territories in place of the languages line
    const top = m.territories
      .slice(0, 3)
      .map((t) => t.name + " " + money(t.gross, currency))
      .join("  ·  ");

    return h(
      "div",
      { class: "mcard ov-card" },
      poster,
      h(
        "div",
        { class: "body" },
        h("div", { class: "ttl" }, m.title),
        top ? h("div", { class: "langs" }, top) : null,
        m.admissions || m.shows
          ? h(
              "div",
              { class: "cardmeta" },
              m.admissions
                ? h("span", { class: "g" }, grp(m.admissions) + " admissions")
                : null,
              m.shows
                ? h("span", { class: "rt" }, grp(m.shows) + " shows")
                : null,
            )
          : null,
        h(
          "div",
          { class: "card-gross" },
          h("span", { class: "cg-label" }, "Overseas Gross"),
          h("span", { class: "cg-val" }, money(m.gross, currency)),
        ),
      ),
    );
  }

  function overseasSection(ov) {
    // Always render the section. Until the overseas collector publishes real
    // figures we show a "coming soon" placeholder rather than sample numbers —
    // dummy data on a live box-office site would be read as real.
    if (!ov) {
      return h(
        "section",
        { class: "section", id: "overseas" },
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
                "Overseas Box Office",
                h("span", { class: "beta-tag" }, "Soon"),
              ),
            ),
          ),
          h(
            "div",
            { class: "ov-soon" },
            stateMsg(
              "globe",
              "Coming soon",
              "International box office tracking is on the way — territory-wise " +
                "collections for every title we follow.",
            ),
          ),
        ),
      );
    }

    return h(
      "section",
      { class: "section", id: "overseas" },
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
              "Overseas Box Office",
              h("span", { class: "beta-tag" }, "Beta"),
            ),
          ),
          ov.updated
            ? h("div", { class: "meta" }, "Updated " + ov.updated)
            : null,
        ),
        h(
          "div",
          { class: "movie-grid" },
          ...ov.movies.slice(0, 8).map((m) => overseasCard(m, ov.currency)),
        ),
      ),
    );
  }

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
  ) {
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
    const merged = mergeFeeds(advFeeds, daily, dailyDate).sort(
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
    // LIVE = what is actually playing and being tracked today (daily feed only).
    // Advance / pre-sale titles are deliberately NOT shown here: an advance
    // number is a forward-looking booking snapshot for a future date, not live
    // box office, so mixing it in would misrepresent what is "live".
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
          social,
        ),
      ),
    );
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
      const dailyDate = c.dayDates.length ? latest(c.dayDates) : null;
      // every advance date, so films opening on different days all appear
      const advFeeds = await loadAdvanceFeeds(c);
      let daily = null;
      if (dailyDate) {
        try {
          daily = await Data.national("daily", dailyDate);
        } catch (e) {
          daily = null;
        }
      }
      renderAllMovies(c, advFeeds, daily, dailyDate);
    } catch (e) {
      console.error(e);
      mount(fetchError(e));
    }
  };

  function renderAllMovies(c, advFeeds, daily, dailyDate) {
    // Every advance date with live titles swapped in (daily wins); see mergeFeeds.
    const entries = mergeFeeds(advFeeds, daily, dailyDate);
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
        ...list.map((e) =>
          movieCard(e.mv, e.mode, e.date, { advance: !e.live }),
        ),
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
                    ? modeLabel(c, "daily")
                    : modeLabel(c, "advance")),
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
      // Narrow the GLOBAL date lists to the ones THIS movie actually has data
      // for. modes.<mode>.dates is every date in the tree, so without this a
      // film shows chips for another film's dates (e.g. a different release
      // day) that 404 when opened. manifest.movieDates is the per-movie map.
      const md = c.m.movieDates || {};
      const mineAdv = (md.advance && md.advance[slug]) || null;
      const mineDay = (md.daily && md.daily[slug]) || null;
      if (mineAdv) c.advDates = c.advDates.filter((d) => mineAdv.includes(d));
      if (mineDay) c.dayDates = c.dayDates.filter((d) => mineDay.includes(d));

      // Unreleased film: District lists it on future dates beyond its opening
      // day too (advance seat maps open for a range), so movieDates can show
      // e.g. both 17 Jul (opening day) and 23 Jul (a normal advance date for
      // a later show). Both are real, selectable dates — only the LABELLING
      // of each one changes (see openingDay/isOpeningDate below), so we no
      // longer collapse advDates down to a single date here.

      const hasAdv = c.advDates.length,
        hasDay = c.dayDates.length;
      if (!tab) tab = hasDay ? "daily" : hasAdv ? "advance" : "historical"; // spec default = Daily
      // resolve mode + date
      // Historical = accumulated DAILY tracking, so the hero/info card and the
      // history file both come from the daily feed (advance only as a fallback).
      let mode = tab === "historical" ? (hasDay ? "daily" : "advance") : tab;
      let dates = mode === "advance" ? c.advDates : c.dayDates;
      if (tab !== "historical" && (!date || !dates.includes(date)))
        date = latest(dates);

      // load movie (need a representative date for hero/meta even on historical)
      // NOTE: the date must come from the SAME feed as `mode`, or we ask for
      // e.g. daily/<an-advance-date>/<slug>, get a 404, and render an empty hero.
      const metaDate =
        date || latest(mode === "advance" ? c.advDates : c.dayDates);
      let movie = null,
        hist = null,
        staleDate = null;
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
        // hero/meta is tab-independent -> fall back to the other feed if needed
        if (!movie) {
          const alt = mode === "daily" ? "advance" : "daily";
          const altDate = latest(alt === "advance" ? c.advDates : c.dayDates);
          if (altDate) {
            try {
              movie = await Data.movie(alt, altDate, slug);
            } catch (e) {
              movie = null;
            }
          }
        }
      } else if (dates.length) {
        // `dates` is the GLOBAL list for the mode. A movie may not appear in the
        // newest file yet (today's run hasn't picked it up, or tracking stopped),
        // which used to render "Not tracked" even though earlier days exist.
        // Walk backwards to the most recent date this movie is actually in.
        const wanted = date;
        const from = Math.max(dates.indexOf(wanted), 0);
        for (let i = from; i >= 0 && !movie; i--) {
          try {
            const mv = await Data.movie(mode, dates[i], slug);
            if (mv) {
              movie = mv;
              date = dates[i];
            }
          } catch (e) {
            /* not in this day's file — keep walking back */
          }
        }
        // flag it so the UI can say "today isn't in yet, showing <date>"
        if (movie && date !== wanted) staleDate = wanted;
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
        staleDate,
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
        h("div", { class: "eyebrow" }, modeLabel(c, mode) + " · India"),
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
      mkTab("daily", "Today"),
      mkTab("historical", "Historical"),
    );

    // filename + export-card context for section downloads
    const ctxLabel =
      date && isOpeningDate(movie, date)
        ? "Opening Day"
        : tab === "historical"
          ? "Historical"
          : !date
            ? tab === "advance"
              ? "Advance"
              : "Today"
            : tab === "advance"
              ? "Advance " + ymdShort(date)
              : "Day " + dayNumber(date, dates, movie);
    const dmeta = (movie && movie.meta) || {};
    DL_META = {
      title,
      ctxLabel,
      date,
      langs:
        (dmeta.languages && dmeta.languages.length
          ? dmeta.languages
          : movie && movie.languages) || [],
      genres: dmeta.genres || [],
      runtime: dmeta.runTime || dmeta.runtime || "",
      poster: (movie && movie.poster) || null,
      updated:
        movie && movie.last_updated ? fmtUpdated(movie.last_updated) : "",
      kpi: movie && movie.kpi ? movie.kpi : null,
    };
    DL_CTX =
      slug +
      "_" +
      (tab === "historical"
        ? "historical"
        : !date
          ? tab
          : tab === "advance"
            ? "advance_" + ymdShort(date)
            : "day_" + dayNumber(date, dates, movie));

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
          (mode === "daily" ? "Today's" : "Advance") +
            " tracking hasn't started",
          mode === "daily"
            ? "Today's collections appear here once the collector runs in daily mode."
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
    const { slug, tab, date, dates, stateName, cityName, staleDate } = s;
    const parts = [];

    // showing an older day because the newest one has no data for this movie yet
    if (staleDate && !stateName)
      parts.push(
        h(
          "div",
          { class: "stale-note" },
          icon("time-past"),
          h(
            "span",
            null,
            (tab === "daily" ? "Today" : fmtDate(staleDate)) +
              " hasn't been tracked yet — showing the last tracked day, " +
              fmtDate(date) +
              ".",
          ),
        ),
      );

    // ---- day / advance chips (Day 1 · 10 Jul · FRI) ----
    // An unreleased film with only ONE tracked date gets no chips: that single
    // date is its opening day and is already named in the panel header. Once
    // it has more than one date (opening day + later advance dates), the
    // chips come back so each date is reachable and individually labelled.
    if (dates.length > 1 || (dates.length === 1 && !openingDay(movie)))
      parts.push(dayChips(s, movie));

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

    // ---- main tab view: collapsible breakdown strip ----
    parts.push(breakdownPanel(s, movie));

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

    // Language-wise — sits directly under States, above Format Summary.
    // Shown for single-language films too: a one-row table still states plainly
    // which language the figures are for, and its absence reads like a bug.
    const langGrid = languageGrid(movie.languageSummary);
    if (langGrid) {
      parts.push(
        block(
          "Language-wise",
          (movie.languageSummary || []).length +
            ((movie.languageSummary || []).length === 1
              ? " language tracked"
              : " languages tracked"),
          langGrid,
        ),
      );
    }

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

  /* ---- upcoming releases: opening day only ---------------------------- */
  // A film whose release date is still in the future has no "days" to page
  // through — only its opening day matters. So the date chips are hidden and
  // the panel is labelled OPENING DAY ADVANCE instead.
  function openingDay(movie) {
    const m = (movie && movie.meta) || {};

    // Primary signal: build_data flags a film that has advance bookings but has
    // NEVER appeared in daily -> it hasn't released, and its opening day is the
    // earliest advance date. (District's API carries no release date at all, so
    // this is inferred from bookings rather than read from a field.)
    if (m.upcoming && /^\d{8}$/.test(String(m.openingDay || ""))) {
      return String(m.openingDay) > todayYMD() ? String(m.openingDay) : null;
    }

    // Fallback: an explicit future release date, if one ever shows up.
    const rel = m.releaseDate ? String(m.releaseDate).slice(0, 10) : null;
    if (!rel || !/^\d{4}-\d{2}-\d{2}$/.test(rel)) return null;
    const ymdRel = rel.replace(/-/g, "");
    return ymdRel > todayYMD() ? ymdRel : null; // null once it has released
  }

  // True only for the ONE date that is this film's opening day. A film can
  // have several advance dates (seat maps open for a range beyond release),
  // and every date except the opening day itself is a normal advance date —
  // it should be labelled "Advance for <date>", not "Opening Day".
  function isOpeningDate(movie, ymd) {
    const open = openingDay(movie);
    return !!open && open === ymd;
  }

  /* ---- day chips + breakdown strip (Daily / Advance) ---------------- */
  let BD_OPEN = true; // collapse state, remembered for the session

  const ymdToDate = (ymd) =>
    new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
  const ymdShort = (ymd) =>
    ymdToDate(ymd).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  const ymdDow = (ymd) =>
    ymdToDate(ymd)
      .toLocaleDateString("en-IN", { weekday: "short" })
      .toUpperCase();
  const ymdLong = (ymd) =>
    ymdToDate(ymd).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const todayYMD = () => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    return "" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  };

  // Day number = days since release when we know the release date,
  // otherwise position in the tracked-dates list.
  function dayNumber(ymd, dates, movie) {
    const rel =
      movie && movie.meta && movie.meta.releaseDate
        ? String(movie.meta.releaseDate).slice(0, 10)
        : null;
    if (rel && /^\d{4}-\d{2}-\d{2}$/.test(rel)) {
      const r = new Date(
        +rel.slice(0, 4),
        +rel.slice(5, 7) - 1,
        +rel.slice(8, 10),
      );
      const diff = Math.round((ymdToDate(ymd) - r) / 86400000);
      if (diff >= 0) return diff + 1;
    }
    const i = dates.indexOf(ymd);
    return i >= 0 ? i + 1 : 1;
  }

  function dayChips(s, movie) {
    const { slug, tab, date, dates } = s;
    const adv = tab === "advance";
    return h(
      "div",
      { class: "daybar" },
      ...dates.map((d) =>
        h(
          "button",
          {
            class: "daychip" + (d === date ? " on" : "") + (adv ? " adv" : ""),
            onclick: () => go(`/movie/${enc(slug)}/${tab}/${d}`),
          },
          h(
            "span",
            { class: "dc-t" },
            adv
              ? isOpeningDate(movie, d)
                ? "Opening Day"
                : "Advance"
              : "Day " + dayNumber(d, dates, movie),
          ),
          h("span", { class: "dc-d" }, ymdShort(d)),
          h("span", { class: "dc-w" }, ymdDow(d)),
        ),
      ),
    );
  }

  function bdMetric(label, value, sub, hot) {
    return h(
      "div",
      { class: "bd-m" + (hot ? " hot" : "") },
      h("div", { class: "v" }, value),
      h("div", { class: "l" }, label),
      sub ? h("div", { class: "s" }, sub) : null,
    );
  }

  function breakdownPanel(s, movie) {
    const { tab, date } = s;
    const k = movie.kpi;
    const adv = tab === "advance";
    const isToday = !adv && date === todayYMD();

    const title =
      adv && isOpeningDate(movie, date)
        ? "Opening Day Advance · " + ymdLong(date)
        : adv
          ? "Advance for " + ymdLong(date)
          : isToday
            ? "Today's Breakdown"
            : "Day " + dayNumber(date, s.dates, movie) + " · " + ymdLong(date);

    const strip = h(
      "div",
      { class: "bd-strip" },
      bdMetric("Gross", inr(k.gross), "max " + inr(maxGross(movie)), true),
      bdMetric("Tickets", num(k.sold), num(k.seats) + " seats"),
      bdMetric("Shows", num(k.shows)),
      bdMetric("Theatres", num(k.theatres)),
      bdMetric("Cities", num(k.cities), k.states + " states"),
      bdMetric("Occupancy", pct(k.occupancy), "weighted avg"),
      bdMetric("Fast-Filling", num(k.fastfilling), "50–98%"),
      bdMetric("Housefull", num(k.housefull), "≥ 98%", true),
    );

    const bodyEl = h(
      "div",
      { class: "bd-body" },
      strip,
      h(
        "div",
        { class: "bd-updated" },
        "Updated: " +
          (movie.last_updated
            ? fmtUpdated(movie.last_updated)
            : fmtDateLong(date)),
      ),
    );

    const chev = icon("angle-down", "bd-chev");
    const head = h(
      "button",
      {
        class: "bd-head",
        "aria-expanded": String(BD_OPEN),
        onclick: (e) => {
          BD_OPEN = !BD_OPEN;
          const panel = e.currentTarget.parentNode;
          panel.classList.toggle("closed", !BD_OPEN);
          e.currentTarget.setAttribute("aria-expanded", String(BD_OPEN));
        },
      },
      icon(adv ? "ticket" : "marker"),
      h("span", { class: "bd-title" }, title),
      chev,
    );

    return h(
      "section",
      {
        class: "bd-panel" + (adv ? " adv" : "") + (BD_OPEN ? "" : " closed"),
      },
      dlBtn(adv ? "Advance Summary" : "Breakdown", "on-head"),
      head,
      bodyEl,
    );
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
  /* ---- section -> PNG export card -------------------------------------
     The PNG is NOT a screenshot of the section. We compose a branded card
     offscreen (logo + title + meta + summary chips + the section's table,
     over a tiled watermark), rasterise that, then throw it away.
     Filename: cbt_<slug>_<context>_<section>.png                        */
  let DL_CTX = ""; // "thandel_day_3" | "thandel_advance_13_jul" | "thandel_historical"
  let DL_META = {}; // { title, ctxLabel, date, updated, kpi:{gross,sold,shows} }

  const dlSlug = (str) =>
    String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const siteHost = () => {
    const hn = (location.hostname || "").replace(/^www\./, "");
    return !hn || /^(localhost|127\.|192\.|0\.0\.0\.0)/.test(hn)
      ? "cinebotrends.com"
      : hn;
  };

  // dom-to-image-more, not html2canvas: html2canvas walks the DOM and blocks on
  // every asset, and on iOS it never resolves ("rendering timed out"). This
  // library serialises into an SVG <foreignObject>, inlines fonts/images itself,
  // and returns a PNG data URL. (Same renderer tracktollywood uses.)
  const TRANSPARENT_PX =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  let libLoad = null;
  function ensureLib() {
    if (window.domtoimage) return Promise.resolve();
    if (libLoad) return libLoad;
    libLoad = new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src =
        "https://cdn.jsdelivr.net/npm/dom-to-image-more@3.10.0/dist/dom-to-image-more.min.js";
      sc.onload = () => res();
      sc.onerror = () => {
        libLoad = null;
        rej(new Error("renderer failed to load"));
      };
      document.head.appendChild(sc);
    });
    return libLoad;
  }

  // Wordmark under the data on the export card
  function watermarkFooter() {
    return h(
      "div",
      { class: "exp-wm" },
      h("span", null, "CINE", h("b", null, "BO"), "TRENDS"),
    );
  }

  // Inline SVG, not the icon font: the uicons face is served from a CDN with no
  // CORS headers, so dom-to-image can't inline it and glyphs rasterise as tofu
  // (懶). A path drawn in the document itself has nothing to fetch.
  const SVG_NS = "http://www.w3.org/2000/svg";
  // Lucide icon geometry (ISC). Proper 24x24 stroke icons — not hand-drawn
  // approximations, and not emoji.
  const EXP_ICONS = {
    // indian-rupee
    gross: ["M6 3h12", "M6 8h12", "m6.5 13 8.5 8", "M6 13h3a6 6 0 0 0 0-12"],
    // ticket
    tickets: [
      "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
      "M13 5v2",
      "M13 17v2",
      "M13 11v2",
    ],
    // clapperboard
    shows: [
      "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z",
      "m6.2 5.3 3.1 3.9",
      "m12.4 3.4 3.1 4",
      "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
    ],
  };

  function expIcon(kind) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "19");
    svg.setAttribute("height", "19");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    (EXP_ICONS[kind] || []).forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  // Now that the uicons face is served same-origin, dom-to-image can inline it,
  // so the export uses the SAME icons as the live UI. (expIcon() below is kept
  // as a font-free fallback.)
  function summaryChip(kind, val) {
    return h("span", { class: "exp-chip" }, icon(kind), h("b", null, val));
  }

  // dom-to-image fetches <img> src itself and swaps in the placeholder when that
  // fails — which is why the logo came out blank. Inline it up-front instead.
  // Every image in the card must be inlined as a data: URL — dom-to-image can't
  // pull a cross-origin asset (BMS posters send no CORS headers for XHR), and a
  // failed image silently becomes the transparent placeholder.
  const IMG_CACHE = {};

  const blobToDataUrl = (blob) =>
    new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res("");
      fr.readAsDataURL(blob);
    });

  // Route 1: fetch + FileReader. Preferred, because it has no canvas to taint.
  async function viaFetch(url) {
    try {
      // cache-bust ONLY for the cross-origin case: Safari will happily reuse the
      // no-CORS response the page already cached for the same URL, and then the
      // canvas/response is unusable. A distinct URL forces a fresh CORS request.
      const u = url + (url.indexOf("?") < 0 ? "?" : "&") + "cbt=1";
      const r = await fetch(u, { mode: "cors", cache: "reload" });
      if (!r.ok) return "";
      return await blobToDataUrl(await r.blob());
    } catch (e) {
      return "";
    }
  }

  // Route 2: <img> + canvas. Works same-origin; cross-origin only if the host
  // sends CORS headers AND Safari didn't already poison the cache.
  function viaCanvas(url, cors) {
    return new Promise((res) => {
      const im = new Image();
      if (cors) im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = im.naturalWidth || 1;
          c.height = im.naturalHeight || 1;
          const ctx = c.getContext("2d");
          ctx.drawImage(im, 0, 0);
          const out = c.toDataURL("image/png");
          res(out && out.length > 2000 ? out : "");
        } catch (e) {
          res("");
        }
      };
      im.onerror = () => res("");
      im.src = cors ? url + (url.indexOf("?") < 0 ? "?" : "&") + "cbt=1" : url;
    });
  }

  async function imgToDataUrl(url, cors) {
    if (!url) return "";
    if (IMG_CACHE[url] !== undefined) return IMG_CACHE[url];
    let out = "";
    if (cors) out = await viaFetch(url); // iOS-safe path first
    if (!out) out = await viaCanvas(url, cors);
    IMG_CACHE[url] = out;
    return out;
  }

  // A poster mirrored into assets/posters/ is same-origin: no CORS request, no
  // cache taint, no canvas restrictions. Only a still-hotlinked URL needs the
  // cross-origin path.
  const isRemote = (u) => /^https?:/i.test(u || "");

  async function exportAssets() {
    const pos = (DL_META && DL_META.poster) || {};
    const [logo, poster, bg] = await Promise.all([
      imgToDataUrl("assets/logo-mark.PNG", false),
      imgToDataUrl(pos.thumb, isRemote(pos.thumb)),
      imgToDataUrl(pos.bg, isRemote(pos.bg)),
    ]);
    return { logo, poster, bg };
  }

  function buildExportCard(section, sectionTitle, A) {
    const m = DL_META || {};
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

  // Delivery differs by platform, and the differences are not cosmetic:
  //  - desktop / Android : <a download> on a blob URL. A real download.
  //  - iOS               : Safari won't offer "Save Image" on a blob: URL, and
  //                        navigator.share() needs transient activation that our
  //                        await chain has already spent. So we show the PNG as a
  //                        data: URL (long-press saves it) plus a Save button that
  //                        calls share() inside a fresh gesture.
  const isIOS = () =>
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function anchorDownload(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Open the PNG as a normal page image in a new tab. Works in Chrome-iOS,
  // where a top-level data:/blob: navigation is blocked but writing into an
  // about:blank window we opened ourselves is not. Long-press there -> Save Image.
  function openInTab(dataUrl, name) {
    const w = window.open("", "_blank");
    if (!w) return false;
    w.document.write(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
        "<title>" +
        name +
        '</title><body style="margin:0;background:#0E0C09">' +
        '<img src="' +
        dataUrl +
        '" alt="' +
        name +
        '" style="width:100%;height:auto;display:block">',
    );
    w.document.close();
    return true;
  }

  function iosSheet(dataUrl, name) {
    const close = () => sheet.remove();

    const save = h(
      "button",
      {
        class: "dlm-btn primary",
        onclick: async (e) => {
          const b = e.currentTarget;
          try {
            // fresh tap => transient activation is valid, so share() is allowed
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], name, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: name });
              close();
              return;
            }
          } catch (err) {
            if (err && err.name === "AbortError") return;
          }
          // Chrome-iOS: no file share -> open it as a real image in a tab
          if (!openInTab(dataUrl, name))
            b.textContent = "Long-press the image above";
        },
      },
      icon("download"),
      " Save image",
    );

    const tab = h(
      "button",
      { class: "dlm-btn", onclick: () => openInTab(dataUrl, name) },
      "Open in new tab",
    );

    const sheet = h(
      "div",
      { class: "dlm", onclick: (e) => e.target === sheet && close() },
      h(
        "div",
        { class: "dlm-box" },
        h("img", { src: dataUrl, alt: name }),
        h(
          "p",
          { class: "dlm-hint" },
          "Long-press the image to save it — or use a button below.",
        ),
        h("div", { class: "dlm-row" }, save, tab),
        h(
          "div",
          { class: "dlm-row", style: "margin-top:8px" },
          h("button", { class: "dlm-btn", onclick: close }, "Close"),
        ),
      ),
    );
    document.body.appendChild(sheet);
  }

  // Opens synchronously on tap. Proves the handler fired, and gives a hang
  // somewhere to show itself instead of looking like a dead button (on mobile
  // the button's text label is hidden, so it can't report state on its own).
  function progressSheet() {
    const msg = h("p", { class: "dlm-hint" }, "Preparing image…");
    const box = h("div", { class: "dlm-box" }, msg);
    const sheet = h("div", { class: "dlm" }, box);
    document.body.appendChild(sheet);
    return {
      sheet,
      // download fired; give the user an out if iOS swallowed it
      saved(openPreview) {
        msg.textContent = "Saved. If nothing downloaded, save it manually:";
        box.appendChild(
          h(
            "div",
            { class: "dlm-row", style: "margin-top:12px" },
            h(
              "button",
              {
                class: "dlm-btn primary",
                onclick: () => {
                  sheet.remove();
                  openPreview();
                },
              },
              "Show image",
            ),
            h(
              "button",
              { class: "dlm-btn", onclick: () => sheet.remove() },
              "Done",
            ),
          ),
        );
      },
      fail(text) {
        msg.textContent = "Couldn't build the image: " + text;
        box.appendChild(
          h(
            "div",
            { class: "dlm-row", style: "margin-top:12px" },
            h(
              "button",
              { class: "dlm-btn primary", onclick: () => sheet.remove() },
              "Close",
            ),
          ),
        );
      },
      done: () => sheet.remove(),
    };
  }

  function errSheet(msg) {
    const sheet = h(
      "div",
      { class: "dlm", onclick: (e) => e.target === sheet && sheet.remove() },
      h(
        "div",
        { class: "dlm-box" },
        h("p", { class: "dlm-hint" }, "Couldn't build the image: " + msg),
        h(
          "div",
          { class: "dlm-row" },
          h(
            "button",
            { class: "dlm-btn primary", onclick: () => sheet.remove() },
            "Close",
          ),
        ),
      ),
    );
    document.body.appendChild(sheet);
  }

  const withTimeout = (p, ms, what) =>
    Promise.race([
      p,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(what + " timed out")), ms),
      ),
    ]);

  // dom-to-image serialises the node into an SVG immediately. Any <img> that
  // has not DECODED yet rasterises as nothing — which is why the first download
  // after a fresh page load came out with an empty poster, and the second (with
  // the image already decoded in memory) was fine. Wait for decode explicitly.
  function decodeAll(root) {
    const jobs = [];

    [...root.querySelectorAll("img")].forEach((im) => {
      if (!im.src) return;
      jobs.push(
        im.decode
          ? im.decode().catch(() => {})
          : new Promise((r) => {
              if (im.complete) return r();
              im.onload = im.onerror = r;
            }),
      );
    });

    // CSS background-image (the hero backdrop) needs the same treatment
    [...root.querySelectorAll("*")].forEach((el) => {
      const bgi = getComputedStyle(el).backgroundImage;
      const m = bgi && bgi.match(/url\("?(data:[^")]+)"?\)/);
      if (!m) return;
      jobs.push(
        new Promise((r) => {
          const im = new Image();
          im.onload = im.onerror = r;
          im.src = m[1];
        }),
      );
    });

    return Promise.all(jobs);
  }

  async function downloadSection(section, sectionTitle, name, btn) {
    const label = btn.querySelector(".dl-label");
    const was = label ? label.textContent : "";
    const touch = isIOS() || window.matchMedia("(max-width: 760px)").matches;
    const prog = touch ? progressSheet() : null;

    btn.disabled = true;
    if (label) label.textContent = "Saving…";

    // EVERYTHING goes inside the try. Building the card outside it meant a throw
    // there skipped the catch entirely: the sheet just sat on "Preparing image…"
    // forever with the rejection swallowed.
    let card = null;
    // hard watchdog: no matter what happens below, the sheet never hangs
    const watchdog = setTimeout(() => {
      if (prog) prog.fail("timed out with no response from the renderer");
    }, 35000);

    try {
      const A = await withTimeout(exportAssets(), 9000, "loading images");
      card = buildExportCard(section, sectionTitle, A);
      document.body.appendChild(card);

      // must happen AFTER the card is in the DOM, before we rasterise
      await withTimeout(decodeAll(card), 8000, "decoding images");

      await withTimeout(ensureLib(), 10000, "loading the renderer");

      const bg = (
        getComputedStyle(document.body).getPropertyValue("--bg") || "#0E0C09"
      ).trim();
      const w = card.offsetWidth || 1180;
      const hgt = card.offsetHeight || 800;

      // iOS caps canvas memory hard: degrade resolution rather than fail
      const cap = isIOS() ? 12e6 : 3e7;
      let scale = isIOS() ? 1.5 : 2;
      if (w * hgt * scale * scale > cap)
        scale = Math.max(1, Math.sqrt(cap / (w * hgt)));

      const opts = {
        bgcolor: bg,
        width: Math.ceil(w * scale),
        height: Math.ceil(hgt * scale),
        style: {
          transform: "scale(" + scale + ")",
          transformOrigin: "top left",
        },
        // NO cacheBust: it appends ?t=… to every URL, which corrupts the
        // data: URI watermark tile. And a failed image THROWS unless a
        // placeholder is supplied — a cross-origin icon font must not kill
        // the whole render.
        imagePlaceholder: TRANSPARENT_PX,
      };

      // dom-to-image drops embedded images on the FIRST toPng() of a node — the
      // <img>/background data URIs aren't in its internal cache yet, so they
      // rasterise empty. The second pass has them warm. (Fresh load = posterless
      // card; reload = fine.) So: one throwaway pass, then the real one.
      //
      // The warm-up is rendered TINY. It only has to populate the cache, and a
      // full-size throwaway doubles peak memory — which on an iPhone is the one
      // resource we cannot spend.
      const WARM = 0.12;
      await withTimeout(
        window.domtoimage.toPng(card, {
          ...opts,
          width: Math.max(1, Math.ceil(w * WARM)),
          height: Math.max(1, Math.ceil(hgt * WARM)),
          style: {
            transform: "scale(" + WARM + ")",
            transformOrigin: "top left",
          },
        }),
        20000,
        "preparing images",
      );

      const dataUrl = await withTimeout(
        window.domtoimage.toPng(card, opts),
        25000,
        "rendering",
      );
      if (!dataUrl || dataUrl.length < 2000)
        throw new Error("renderer returned an empty image");

      // Every platform gets a real download first: <a download> on a data: URL
      // is honoured by desktop, Android Chrome and iOS (this is what
      // tracktollywood does, and it downloads directly there).
      anchorDownload(dataUrl, name);

      if (isIOS()) {
        // ...but iOS can silently swallow it depending on browser/version, and
        // we get no callback either way. So offer a fallback the user can act on.
        if (prog) prog.saved(() => iosSheet(dataUrl, name));
      } else if (prog) {
        prog.done();
      }
      if (label) label.textContent = was;
    } catch (e) {
      console.error(e);
      const msg = (e && e.message) || String(e);
      if (prog) prog.fail(msg);
      else errSheet(msg);
      if (label) label.textContent = "Failed";
      setTimeout(() => {
        if (label) label.textContent = was;
      }, 2200);
    } finally {
      clearTimeout(watchdog);
      if (card) card.remove();
      btn.disabled = false;
    }
  }

  function dlBtn(section, cls) {
    const name =
      dlSlug(["cbt", DL_CTX, section].filter(Boolean).join("_")) + ".png";
    return h(
      "button",
      {
        class: "dl-btn" + (cls ? " " + cls : ""),
        title: "Download as PNG",
        onclick: (e) => {
          const btn = e.currentTarget;
          const node = btn.closest(".block, .bd-panel");
          if (node)
            downloadSection(node, section, name, btn).catch((err) => {
              console.error(err);
              errSheet((err && err.message) || String(err));
              btn.disabled = false;
            });
        },
      },
      icon("download"),
      h("span", { class: "dl-label" }, "Download"),
    );
  }

  function block(title, hint, content) {
    return h(
      "div",
      { class: "block" },
      h(
        "div",
        { class: "block-hd" },
        h(
          "div",
          { class: "block-hd-t" },
          h("h3", null, title),
          hint && h("p", { class: "hint" }, hint),
        ),
        dlBtn(title),
      ),
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
          // state sits under the city name, not in its own column
          showState !== false ? h("div", { class: "sub" }, ct.state) : null,
        ),
        h("td", { class: "gross-cell gold" }, inr(ct.gross)),
        h("td", { class: "num" }, num(ct.shows)),
        h("td", { class: "occ-cell" }, occMeter(ct.occupancy)),
        h("td", { class: "num" }, num(ct.sold)),
      ),
    );
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "bo cities" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "#"),
            h("th", null, "City"),
            h("th", { class: "gross-cell" }, "Gross"),
            h("th", { class: "num" }, "Shows"),
            h("th", { class: "occ-cell" }, "Occupancy"),
            h("th", { class: "num" }, "Sold"),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    );
  }

  // Language-wise collections. The collector has always emitted
  // movie.languageSummary alongside formatSummary — it just was never shown.
  // Same shape as formatGrid, plus a share-of-gross % column, since "which
  // language is actually driving this" is the thing people read it for.
  function languageGrid(langs) {
    if (!langs || !langs.length) return null;

    const total = langs.reduce((a, l) => a + (l.gross || 0), 0);
    const ordered = langs.slice().sort((a, b) => b.gross - a.gross);

    const rows = ordered.map((l) =>
      h(
        "tr",
        null,
        h("td", null, h("span", { class: "tag lang" }, l.language)),
        h("td", { class: "num gold" }, inr(l.gross)),
        h(
          "td",
          { class: "num" },
          h(
            "span",
            { class: "share" },
            total ? ((l.gross / total) * 100).toFixed(1) + "%" : "—",
          ),
        ),
        h("td", { class: "num" }, num(l.sold)),
        h("td", { class: "num" }, num(l.shows)),
        h("td", null, occMeter(l.occupancy)),
      ),
    );

    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "bo langwise" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Language"),
            h("th", { class: "num" }, "Gross"),
            h("th", { class: "num" }, "%"),
            h("th", { class: "num" }, "Tickets"),
            h("th", { class: "num" }, "Shows"),
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
        citiesTable(cities, slug, tab, date, true),
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
  /* ---- historical: cumulative tracked totals ------------------------ */
  const dYMD = (d) => String(d.date || "").replace(/-/g, "");
  // A day counts only once it has ended. Trust the builder's flag when present,
  // fall back to a date compare so this still works on pre-existing history.
  const isDone = (d) =>
    typeof d.complete === "boolean" ? d.complete : dYMD(d) < todayYMD();
  const tc = (v) => h("span", { class: "totcell" }, v);

  // "Sat" from 20260711 / 2026-07-11
  const dow = (raw) => {
    const y = String(raw).replace(/-/g, "");
    if (!/^\d{8}$/.test(y)) return "—";
    return ymdToDate(y).toLocaleDateString("en-IN", { weekday: "short" });
  };

  // Day-over-day gross movement. No previous day -> em dash, not a fake 0%.
  function changeCell(cur, prev) {
    if (!prev) return h("span", { class: "chg flat" }, "—");
    const p = ((cur - prev) / prev) * 100;
    const up = p >= 0;
    return h(
      "span",
      { class: "chg " + (up ? "up" : "dn") },
      (up ? "▲ +" : "▼ ") + p.toFixed(1) + "%",
    );
  }

  function histTotals(hist) {
    const days = (hist && hist.days) || [];
    const done = days.filter(isDone);
    const t = {
      days: done.length,
      gross: 0,
      sold: 0,
      seats: 0,
      shows: 0,
      housefull: 0,
      fastfilling: 0,
      theatres: 0,
      cities: 0,
      live: days.find((d) => !isDone(d)) || null,
      best: null,
    };
    done.forEach((d) => {
      t.gross += +d.gross || 0;
      t.sold += +d.sold || 0;
      t.seats += +d.seats || 0;
      t.shows += +d.shows || 0;
      t.housefull += +d.housefull || 0;
      t.fastfilling += +d.fastfilling || 0;
      t.theatres = Math.max(t.theatres, +d.theatres || 0); // footprint, not a sum
      t.cities = Math.max(t.cities, +d.cities || 0);
      if (!t.best || (+d.gross || 0) > (+t.best.gross || 0)) t.best = d;
    });
    // Weighted when we have seats; otherwise fall back to the mean of the days.
    t.occupancy = t.seats
      ? (t.sold / t.seats) * 100
      : done.length
        ? done.reduce((a, d) => a + (+d.occupancy || 0), 0) / done.length
        : 0;
    return t;
  }

  function totalTrackedPanel(t) {
    if (!t.days)
      return stateMsg(
        "time-past",
        "No completed days yet",
        t.live
          ? "Day " +
              t.live.day +
              " is still running. Totals appear once the day closes."
          : "Totals appear once the first tracked day finishes.",
      );

    const strip = h(
      "div",
      { class: "bd-strip" },
      bdMetric(
        "Total Gross",
        inr(t.gross),
        t.days + (t.days === 1 ? " day" : " days"),
        true,
      ),
      bdMetric(
        "Tickets",
        num(t.sold),
        t.seats ? num(t.seats) + " seats" : null,
      ),
      bdMetric("Shows", num(t.shows)),
      t.theatres ? bdMetric("Theatres", num(t.theatres), "peak") : null,
      t.cities ? bdMetric("Cities", num(t.cities), "peak") : null,
      bdMetric("Occupancy", pct(t.occupancy), t.seats ? "weighted" : "day avg"),
      t.best
        ? bdMetric("Best Day", "Day " + t.best.day, fmtDate(t.best.date))
        : null,
      t.housefull
        ? bdMetric("Housefull", num(t.housefull), "shows", true)
        : null,
    );

    return h(
      "section",
      { class: "bd-panel hist" },
      dlBtn("Total Tracked", "on-head"),
      h(
        "div",
        { class: "bd-head static" },
        icon("chart-histogram"),
        h(
          "span",
          { class: "bd-title" },
          "Total Tracked · " + t.days + (t.days === 1 ? " Day" : " Days"),
        ),
      ),
      h(
        "div",
        { class: "bd-body" },
        strip,
        t.live
          ? h(
              "div",
              { class: "bd-updated" },
              "Day " +
                t.live.day +
                " (" +
                fmtDate(t.live.date) +
                ") is still running — excluded until it closes.",
            )
          : null,
      ),
    );
  }

  // Mirrors citiesTable() (# / city + state beneath / gross / shows / occ / sold)
  // but static — history rows have no single date to drill into.
  function histCitiesTable(cities) {
    const rows = (cities || []).map((c, i) =>
      h(
        "tr",
        null,
        h("td", { class: "rank" + (i < 3 ? " top" : "") }, i + 1),
        h(
          "td",
          null,
          h("div", { class: "city-nm" }, c.city),
          c.state ? h("div", { class: "sub" }, c.state) : null,
        ),
        h("td", { class: "gross-cell gold" }, inr(c.gross)),
        h("td", { class: "num" }, num(c.shows)),
        h("td", { class: "occ-cell" }, occMeter(c.occupancy)),
        h("td", { class: "num" }, num(c.sold)),
      ),
    );
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "bo cities" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "#"),
            h("th", null, "City"),
            h("th", { class: "gross-cell" }, "Gross"),
            h("th", { class: "num" }, "Shows"),
            h("th", { class: "occ-cell" }, "Occupancy"),
            h("th", { class: "num" }, "Sold"),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    );
  }

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
    const t = histTotals(hist);
    DL_META = Object.assign({}, DL_META, {
      ctxLabel: "Historical · " + t.days + (t.days === 1 ? " Day" : " Days"),
      date: null,
      updated: hist.last_updated || (DL_META && DL_META.updated) || "",
      kpi: t.days ? { gross: t.gross, sold: t.sold, shows: t.shows } : null,
    });

    if (hist.last_updated)
      parts.push(
        h(
          "div",
          { class: "updated" },
          icon("time-past"),
          "Updated " + hist.last_updated,
        ),
      );

    // Cumulative total across every CLOSED day of daily tracking
    parts.push(totalTrackedPanel(t));

    // Table 1 — day-wise. TOTAL pinned at the bottom, newest day first,
    // day-over-day change on gross, live day flagged.
    const asc = hist.days.slice().sort((a, b) => a.day - b.day);
    const prevGross = new Map();
    asc.forEach((d, i) => {
      if (i) prevGross.set(d.day, +asc[i - 1].gross || 0);
    });

    const dayRows = [];
    asc
      .slice()
      .reverse()
      .forEach((d) =>
        dayRows.push([
          isDone(d)
            ? "Day " + d.day
            : frag("Day " + d.day, h("span", { class: "livetag" }, "LIVE")),
          fmtDate(d.date),
          dow(d.date),
          inr(d.gross),
          changeCell(+d.gross || 0, prevGross.get(d.day)),
          num(d.sold),
          num(d.shows),
          occMeter(d.occupancy),
        ]),
      );

    // TOTAL pinned at the bottom
    if (t.days)
      dayRows.push([
        tc("TOTAL"),
        tc(t.days + (t.days === 1 ? " day" : " days")),
        tc("—"),
        tc(inr(t.gross)),
        tc("—"),
        tc(num(t.sold)),
        tc(num(t.shows)),
        tc(pct(t.occupancy)),
      ]);

    parts.push(
      block(
        "Day-wise Performance",
        t.days +
          " day(s) counted" +
          (t.live ? " · day " + t.live.day + " still running" : ""),
        simpleTable(
          [
            "Day",
            "Date",
            "Weekday",
            "Gross",
            "Change",
            "Tickets",
            "Shows",
            "Occupancy",
          ],
          dayRows,
          [0, 0, 0, 1, 1, 1, 1, 2],
        ),
      ),
    );

    // Tables 2-4 are cumulative across closed days once the builder has run;
    // on older history files (or before any day closes) they are a single-day snapshot.
    const scope = hist.cumulative
      ? "Cumulative across " + t.days + (t.days === 1 ? " day" : " days")
      : "Live snapshot" +
        (t.live ? " · day " + t.live.day + " in progress" : "");

    // Table 2 — city-wise (same shape as Top 20 Cities: state under the city name)
    parts.push(
      block(
        "City-wise Performance",
        scope + " · top cities by gross",
        histCitiesTable(hist.cities),
      ),
    );

    // Table 3 — state-wise
    parts.push(
      block(
        "State-wise Performance",
        scope + " · all states",
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
        scope + " · by presentation format",
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
