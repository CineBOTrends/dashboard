

/* ---- upcoming releases: opening day only ---------------------------- */
// A film whose release date is still in the future has no "days" to page
// through — only its opening day matters. So the date chips are hidden and
// the panel is labelled OPENING DAY ADVANCE instead.
// Release date as YYYYMMDD, or null when the film has no usable one.
export function releaseYMD(movie) {
  const m = (movie && movie.meta) || {};
  const raw = m.releaseDate || (movie && movie.releaseDate) || "";
  const x = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
  return x ? x[1] + x[2] + x[3] : null;
}

export function openingDay(movie) {
  const m = (movie && movie.meta) || {};

  // The explicit release date is the source of truth for opening day.
  // Do not gate this by today's date: users can still open older advance
  // dates and should see the same Premiere / Opening Day labels.
  const rel = releaseYMD(movie);
  if (rel) return rel;

  // Primary signal: build_data flags a film that has advance bookings but has
  // NEVER appeared in daily -> it hasn't released, and its opening day is the
  // earliest advance date. (District's API carries no release date at all, so
  // this is inferred from bookings rather than read from a field.)
  if (m.upcoming && /^\d{8}$/.test(String(m.openingDay || ""))) {
    return String(m.openingDay);
  }

  return null;
}

// True only for the ONE date that is this film's opening day. A film can
// have several advance dates (seat maps open for a range beyond release),
// and every date except the opening day itself is a normal advance date —
// it should be labelled "Advance for <date>", not "Opening Day".
export function isOpeningDate(movie, ymd) {
  const open = openingDay(movie);
  return !!open && open === ymd;
}

// Premiere = any date BEFORE the release date (bookings / shows that open
// ahead of release). It is never counted as a numbered day: the release
// date itself is always Day 1.
export function isPremiereDate(movie, ymd) {
  const open = openingDay(movie);
  if (!open || !/^\d{8}$/.test(String(ymd || ""))) return false;
  return String(ymd) < open; // YYYYMMDD compares correctly as a string
}

export const ymdToDate = (ymd) =>
  new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
export const ymdShort = (ymd) =>
  ymdToDate(ymd).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
export const ymdDow = (ymd) =>
  ymdToDate(ymd)
    .toLocaleDateString("en-IN", { weekday: "short" })
    .toUpperCase();
export const ymdLong = (ymd) =>
  ymdToDate(ymd).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const todayYMD = () => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  return "" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
};

// Day number = days since release when we know the release date,
// otherwise position in the tracked-dates list.
// Release day = Day 1. A date before release is a premiere, not a day, so
// it returns 0 (callers show "Premiere" via dayLabel).
export function dayNumber(ymd, dates, movie) {
  const rel = releaseYMD(movie);
  if (rel) {
    const diff = Math.round((ymdToDate(ymd) - ymdToDate(rel)) / 86400000);
    return diff >= 0 ? diff + 1 : 0;
  }
  const i = dates.indexOf(ymd);
  return i >= 0 ? i + 1 : 1;
}

// "Premiere" for pre-release dates, otherwise "Day N" (release day = Day 1).
export function dayLabel(ymd, dates, movie) {
  return isPremiereDate(movie, ymd)
    ? "Premiere"
    : "Day " + dayNumber(ymd, dates, movie);
}
