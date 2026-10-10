import "../../styles/multiplex.css";
import { mount, page } from "../../components/chrome.js";
import { loading, stateMsg } from "../../components/states.js";
import { todayYMD } from "../../core/dates.js";
import { h } from "../../core/dom.js";
import { fmtDateLong, grp, num } from "../../core/format.js";
import { go } from "../../core/router.js";
import { Data } from "../../core/store.js";

/* ---------- multiplex report ---------- */
function multiplexRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return value.movies || value.items || value.rows || value.data || [];
}

function multiplexGroups(raw) {
  const groups =
    (raw && (raw.multiplexes || raw.theatres || raw.groups || raw.data)) ||
    raw;
  if (!Array.isArray(groups) || !groups.length) return [];
  return groups
    .map((group) => {
      const rows = multiplexRows(
        group.movies || group.items || group.rows || group.data,
      );
      return {
        name:
          group.label ||
          group.name ||
          group.theatre ||
          group.multiplex ||
          group.title ||
          "Multiplex",
        gross: group.gross ?? group.totalGross ?? group.collection ?? 0,
        shows:
          group.shows ??
          group.totalShows ??
          rows.reduce(
            (n, row) => n + Number(row.shows || row.showCount || 0),
            0,
          ),
        rows,
      };
    })
    .filter((group) => group.rows.length);
}

function multiplexRow(row) {
  const movie = row.movie || row.title || row.name || "Untitled";
  const gross = row.gross ?? row.collection ?? row.amount ?? 0;
  const shows = row.shows ?? row.showCount ?? row.screenCount ?? 0;
  return [abbreviateMovieLabel(movie), gross, shows];
}

// Movie strings end "(FORMAT - Language)" e.g. "(2D - Telugu)",
// "(DOLBY CINEMA 2D - English)" — shorten just the language part so long
// rows fit the compact multiplex cards. A legend spells the codes out.
const MULTIPLEX_LANG_ABBR = {
  telugu: "T",
  tamil: "Ta",
  hindi: "H",
  english: "E",
  kannada: "K",
  malayalam: "M",
  marathi: "Mr",
  bengali: "B",
  punjabi: "P",
};
const MULTIPLEX_LANG_RE = /^(.*)\(([^()]+?)\s*-\s*([A-Za-z]+)\)\s*$/;
function movieLanguageAbbr(movie) {
  const m = String(movie || "").match(MULTIPLEX_LANG_RE);
  if (!m) return null;
  const key = m[3].trim().toLowerCase();
  return MULTIPLEX_LANG_ABBR[key]
    ? { key, abbr: MULTIPLEX_LANG_ABBR[key] }
    : null;
}
function abbreviateMovieLabel(movie) {
  const s = String(movie || "");
  const m = s.match(MULTIPLEX_LANG_RE);
  if (!m) return s;
  const [, title, , lang] = m;
  const abbr = MULTIPLEX_LANG_ABBR[lang.trim().toLowerCase()];
  if (!abbr) return s;
  return `${title.trim()} (${abbr})`;
}
// Legend strip, e.g. "(T) Telugu · (H) Hindi · L = Lakhs · Cr = Crore" —
// only lists language codes actually used in the current report.
function multiplexLegend(groups) {
  const seen = new Map(); // key -> {abbr, label}
  groups.forEach((g) =>
    g.rows.forEach((r) => {
      const lang = movieLanguageAbbr(r.movie || r.title || r.name);
      if (lang && !seen.has(lang.key)) {
        seen.set(lang.key, lang.abbr);
      }
    }),
  );
  if (!seen.size) return null;
  const order = Object.keys(MULTIPLEX_LANG_ABBR);
  const langBits = order
    .filter((k) => seen.has(k))
    .map((k) => `(${seen.get(k)}) ${k[0].toUpperCase()}${k.slice(1)}`);
  const bits = [...langBits, "L = Lakhs", "K = Thousands", "Cr = Crore"];
  return h("p", { class: "multiplex-legend" }, bits.join(" · "));
}

// Always scale to K/L/Cr (never a long raw rupee string) so figures stay
// short and line up cleanly on narrow phone screens.
function multiplexMoney(value) {
  const v = Number(value) || 0;
  if (v >= 1e7) return "₹" + (v / 1e7).toFixed(2) + "Cr";
  if (v >= 1e5) return "₹" + (v / 1e5).toFixed(2) + "L";
  if (v >= 1e3) return "₹" + (v / 1e3).toFixed(2) + "K";
  return "₹" + grp(v);
}

// "20260922" -> "2026-09-22" (what <input type="date"> needs)
function ymdToInputVal(ymd) {
  if (!ymd || ymd.length !== 8) return "";
  return ymd.slice(0, 4) + "-" + ymd.slice(4, 6) + "-" + ymd.slice(6, 8);
}
// "2026-09-22" -> "20260922"
function inputValToYmd(v) {
  return String(v || "").replace(/-/g, "");
}

// Native <input type="date"> styled to look like the other stat boxes —
// clicking/tapping it opens the browser's own calendar UI, and picking a
// date there routes straight to that day's report.
function multiplexDatePicker(currentDate, availableDates) {
  const sorted = availableDates.slice().sort();
  const min = sorted.length ? ymdToInputVal(sorted[0]) : null;
  // Never cap below today: the manifest's last known date can lag behind
  // the real date (it's only rebuilt when the collector runs), which was
  // greying out "today" in the calendar even once today's report existed.
  const knownMax = sorted.length ? sorted[sorted.length - 1] : null;
  const today = todayYMD();
  const maxYmd = knownMax && knownMax > today ? knownMax : today;
  const max = ymdToInputVal(maxYmd);
  const isLatest = !!knownMax && currentDate === knownMax;
  return h(
    "div",
    { class: "multiplex-stat multiplex-date-stat" },
    h("span", null, "Date"),
    h(
      "div",
      { class: "multiplex-date-row" },
      h("input", {
        type: "date",
        class: "multiplex-date-input",
        value: ymdToInputVal(currentDate),
        min,
        max,
        "aria-label": "Choose a report date",
        onchange: (e) => {
          const ymd = inputValToYmd(e.target.value);
          if (ymd.length === 8) go(`/multiplex/${ymd}`);
        },
      }),
      isLatest && h("span", { class: "multiplex-latest-badge" }, "Latest"),
    ),
  );
}

export const multiplex = async function (p) {
  mount(page(h("div", { class: "wrap section" }, loading())));
  try {
    const manifest = await Data.manifest();
    const dailyDates =
      (manifest.modes.daily && manifest.modes.daily.dates) || [];
    const mode = "daily";
    // /multiplex/<YYYYMMDD> — an explicit date picked from the calendar.
    const requested = p && p[1] && /^\d{8}$/.test(p[1]) ? p[1] : null;

    let date = requested;
    let raw = null;
    let missingForDate = false;

    if (requested) {
      try {
        raw = await Data.multiplex(mode, requested);
      } catch (e) {
        // That day's collector hasn't published a multiplex report (or
        // never will, e.g. a holiday with no shows) — still show the
        // picker so the person can jump to a different date instead of
        // the whole page just disappearing.
        missingForDate = true;
      }
    } else {
      for (const candidate of dailyDates.slice().reverse()) {
        try {
          raw = await Data.multiplex(mode, candidate);
          date = candidate;
          break;
        } catch (e) {
          // A manifest date can exist before its multiplex collector output.
        }
      }
    }

    if (!date && !dailyDates.length) {
      mount(
        page(
          h(
            "div",
            { class: "wrap section" },
            stateMsg(
              "film",
              "No multiplex data yet",
              "Multiplex reports will appear here when data is published.",
            ),
          ),
        ),
      );
      return;
    }
    // Nothing loaded at all and nothing in the manifest to fall back to.
    if (!date) date = dailyDates[dailyDates.length - 1];

    const groups = raw ? multiplexGroups(raw) : [];
    const report = raw && typeof raw === "object" ? raw : {};
    const totalGross =
      report.totals?.gross ??
      report.gross ??
      report.totalGross ??
      groups.reduce((n, group) => n + Number(group.gross || 0), 0);
    const totalShows =
      report.totals?.shows ??
      report.shows ??
      report.totalShows ??
      groups.reduce((n, group) => n + Number(group.shows || 0), 0);
    const dash = "—";
    mount(
      page(
        h(
          "div",
          { class: "wrap section multiplex-page" },
          h("div", { class: "eyebrow" }, "Live Tracking"),
          h(
            "h2",
            { class: "display multiplex-title" },
            "Daily Multiplex Report",
          ),
          h(
            "p",
            { class: "multiplex-subtitle" },
            "Live tracked collections across select multiplexes.",
          ),
          h(
            "div",
            { class: "multiplex-meta" },
            multiplexDatePicker(date, dailyDates),
            h(
              "div",
              { class: "multiplex-stat" },
              h("span", null, "Theatres"),
              h("b", null, missingForDate ? dash : groups.length),
            ),
            h(
              "div",
              { class: "multiplex-stat" },
              h("span", null, "Gross"),
              h(
                "b",
                null,
                missingForDate ? dash : multiplexMoney(totalGross),
              ),
            ),
            h(
              "div",
              { class: "multiplex-stat" },
              h("span", null, "Shows"),
              h("b", null, missingForDate ? dash : num(totalShows)),
            ),
          ),
          groups.length
            ? h(
                "div",
                { class: "multiplex-grid" },
                ...groups.map((group) =>
                  h(
                    "section",
                    { class: "multiplex-card" },
                    h(
                      "div",
                      { class: "multiplex-card-head" },
                      h("strong", null, group.name),
                      h(
                        "span",
                        null,
                        `${multiplexMoney(group.gross)} · ${num(group.shows)} shows`,
                      ),
                    ),
                    h(
                      "div",
                      { class: "multiplex-table-scroll" },
                      h(
                        "table",
                        { class: "bo multiplex-table" },
                        h(
                          "thead",
                          null,
                          h(
                            "tr",
                            null,
                            h("th", null, "#"),
                            h("th", null, "Movie"),
                            h("th", { class: "num" }, "Gross"),
                            h("th", { class: "num" }, "Shows"),
                          ),
                        ),
                        h(
                          "tbody",
                          null,
                          ...group.rows.map((row, index) => {
                            const [movie, gross, shows] = multiplexRow(row);
                            return h(
                              "tr",
                              null,
                              h(
                                "td",
                                {
                                  class: "rank" + (index < 3 ? " top" : ""),
                                },
                                index + 1,
                              ),
                              h("td", null, movie),
                              h(
                                "td",
                                { class: "num gold" },
                                multiplexMoney(gross),
                              ),
                              h("td", { class: "num" }, shows),
                            );
                          }),
                        ),
                      ),
                    ),
                  ),
                ),
              )
            : stateMsg(
                "film",
                missingForDate
                  ? `No multiplex report for ${fmtDateLong(date)}`
                  : "No multiplex data for this date",
                missingForDate
                  ? "Pick a different day from the calendar above."
                  : "Try again after the next multiplex report is published.",
              ),
          multiplexLegend(groups),
        ),
      ),
    );
  } catch (e) {
    console.error(e);
    mount(
      page(
        h(
          "div",
          { class: "wrap section" },
          stateMsg(
            "triangle-warning",
            "Couldn't load multiplex data",
            "Check that the multiplex report exists for the latest tracking date.",
          ),
        ),
      ),
    );
  }
};
