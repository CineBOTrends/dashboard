import { dlBtn } from "./dlBtn.js";
import { dayLabel, isOpeningDate, isPremiereDate, todayYMD, ymdDow, ymdLong, ymdShort } from "../core/dates.js";
import { h, icon } from "../core/dom.js";
import { fmtDateLong, fmtUpdated, inr, num, pct } from "../core/format.js";
import { enc, go } from "../core/router.js";

/* ---- day chips + breakdown strip (Daily / Advance) ---------------- */
let BD_OPEN = true; // collapse state, remembered for the session

export function dayChips(s, movie) {
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
            ? isPremiereDate(movie, d)
              ? "Premiere"
              : isOpeningDate(movie, d)
                ? "Opening Day"
                : "Advance"
            : dayLabel(d, dates, movie),
        ),
        h("span", { class: "dc-d" }, ymdShort(d)),
        h("span", { class: "dc-w" }, ymdDow(d)),
      ),
    ),
  );
}

export function bdMetric(label, value, sub, hot) {
  return h(
    "div",
    { class: "bd-m" + (hot ? " hot" : "") },
    h("div", { class: "v" }, value),
    h("div", { class: "l" }, label),
    sub ? h("div", { class: "s" }, sub) : null,
  );
}

export function breakdownPanel(s, movie) {
  const { tab, date } = s;
  const k = movie.kpi;
  const adv = tab === "advance";
  const isToday = !adv && date === todayYMD();

  const title =
    adv && isPremiereDate(movie, date)
      ? "Premiere Advance · " + ymdLong(date)
      : adv && isOpeningDate(movie, date)
        ? "Opening Day Advance · " + ymdLong(date)
        : adv
          ? "Advance for " + ymdLong(date)
          : isToday
            ? "Today's Breakdown"
            : dayLabel(date, s.dates, movie) + " · " + ymdLong(date);

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
  if (movie.maxGross != null) return movie.maxGross;
  let mg = 0;
  for (const st of movie.states)
    for (const c of st.cityList)
      for (const t of c.theatreList || [])
        for (const sh of t.showTimings) mg += sh.maxGross || 0;
  return mg;
}
export function flatCities(movie) {
  const out = [];
  for (const st of movie.states)
    for (const c of st.cityList) out.push({ ...c, state: st.state });
  out.sort((a, b) => b.gross - a.gross);
  return out;
}
