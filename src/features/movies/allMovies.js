import { mount, page } from "../../components/chrome.js";
import { movieCard } from "../../components/movieCard.js";
import { fetchError, loading, stateMsg } from "../../components/states.js";
import { h, icon } from "../../core/dom.js";
import { FORMAT_ORDER, ctx, latest, loadAdvanceFeeds, mergeFeeds, modeLabel } from "../../core/feeds.js";
import { fmtDate } from "../../core/format.js";
import { Data } from "../../core/store.js";
import { cap } from "../home/featureCarousel.js";
import { globalCard, safeGlobal } from "../home/globalStrip.js";

// ---- Dedicated All Movies page (#/movies) with full list + filters ----
export const movies = async function () {
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
              "Add tracking data to the data/ folder to populate the dashboard.",
            ),
          ),
        ),
      );
    const dailyDate = c.dayDates.length ? latest(c.dayDates) : null;
    // every advance date, so films opening on different days all appear
    const [advFeeds, global] = await Promise.all([
      loadAdvanceFeeds(c),
      safeGlobal(),
    ]);
    let daily = null;
    if (dailyDate) {
      try {
        daily = await Data.national("daily", dailyDate);
      } catch (e) {
        daily = null;
      }
    }
    renderAllMovies(c, advFeeds, daily, dailyDate, global);
  } catch (e) {
    console.error(e);
    mount(fetchError(e));
  }
};

function renderAllMovies(c, advFeeds, daily, dailyDate, global) {
  // advFeeds is oldest -> newest; the last one is the most recent advance
  // date, used only for the "updated" line in the header.
  const lastFeed =
    advFeeds && advFeeds.length ? advFeeds[advFeeds.length - 1] : null;
  const advNat = lastFeed ? lastFeed.nat : null;
  const advDate = lastFeed ? lastFeed.date : null;

  // Every advance date with live titles swapped in (daily wins); see mergeFeeds.
  const entries = mergeFeeds(advFeeds, daily, dailyDate);
  const movies = entries.map((e) => e.mv);
  const langs = [...new Set(movies.flatMap((m) => m.languages))].sort();
  const fmts = FORMAT_ORDER.filter((f) =>
    movies.some((m) => m.formats.includes(f)),
  );
  const st = { q: "", lang: "", fmt: "", sort: "gross" };

  const globalMovies = global ? global.movies : [];
  const grid = h("div", { class: "movie-grid", id: "grid" });
  function paint() {
    let list = entries.filter(({ mv: m }) => {
      if (st.q && !m.title.toLowerCase().includes(st.q.toLowerCase()))
        return false;
      if (st.lang && !m.languages.includes(st.lang)) return false;
      if (st.fmt && !m.formats.includes(st.fmt)) return false;
      return true;
    });
    // Global titles always follow the Indian ones.
    const gList = globalMovies.filter((m) => {
      if (st.q && !m.title.toLowerCase().includes(st.q.toLowerCase()))
        return false;
      if (st.lang && !(m.cur.languages || []).includes(st.lang)) return false;
      if (st.fmt && !(m.cur.formats || []).includes(st.fmt)) return false;
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
    if (!list.length && !gList.length) {
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
      ...gList.map((m) => globalCard(m, global.currency)),
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
          h("a", { href: "/home" }, "Home"),
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
            (movies.length + globalMovies.length) +
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
