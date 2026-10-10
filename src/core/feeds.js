import { Data } from "./store.js";

// The "daily" feed is presented as TODAY everywhere in the UI. The token
// itself stays "daily" (routes, data paths, manifest keys).
export const modeLabel = (c, mode) =>
  mode === "daily"
    ? "Today"
    : (c && c.m && c.m.modes[mode] && c.m.modes[mode].label) || "Advance";
export const FORMAT_ORDER = [
  "2D",
  "3D",
  "IMAX",
  "4DX",
  "ICE",
  "Dolby Cinema",
  "Others",
];

/* helper: pick the modes/dates we actually have */
export async function ctx() {
  const m = await Data.manifest();
  const advDates = (m.modes.advance && m.modes.advance.dates) || [];
  const dayDates = (m.modes.daily && m.modes.daily.dates) || [];
  return { m, advDates, dayDates };
}
export const latest = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

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
export async function loadAdvanceFeeds(c) {
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

export function mergeFeeds(advFeeds, daily, dailyDate) {
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

/* ============================================================
   HOME
   ============================================================ */
