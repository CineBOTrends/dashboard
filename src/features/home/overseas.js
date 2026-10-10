import { posterEl } from "../../components/movieCard.js";
import { h, icon } from "../../core/dom.js";
import { grp } from "../../core/format.js";
import { Data } from "../../core/store.js";

export async function safeEditorial(fetchFn) {
  try {
    const data = await fetchFn();
    return Array.isArray(data) ? data : data.items || [];
  } catch (e) {
    return [];
  }
}

/* ============================================================
   OVERSEAS BOX OFFICE
   Fed by a SEPARATE collector (still in testing), so everything here is
   written defensively: a missing file, a half-written file or a schema that
   drifts must never break the home page. If we can't read usable data the
   section simply does not render — same pattern as liveSection.
   ============================================================ */

// Never throws. A 404 while the overseas collector is still being built is a
// normal state, not an error.
export async function safeOverseas() {
  try {
    return normalizeOverseas(await Data.overseas());
  } catch (e) {
    return null; // no file yet, bad JSON, offline — all mean "nothing to show"
  }
}

export const _num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Pick the first key that's actually present — the collector's field names
// are not final yet, so accept the obvious synonyms instead of hard-coding one.
export const _pick = (o, keys, dflt) => {
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
export function money(v, cur) {
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
  const poster = posterEl(m.title, m.slug);
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

export function overseasSection(ov) {
  // Temporarily hide the overseas placeholder while the collector is still
  // being developed. Keep the original code below commented for easy reuse
  // when real overseas data is ready.
  // if (!ov) {
  //   return h(
  //     "section",
  //     { class: "section", id: "overseas" },
  //     h(
  //       "div",
  //       { class: "wrap" },
  //       h(
  //         "div",
  //         { class: "section-head" },
  //         h(
  //           "div",
  //           null,
  //           h(
  //             "div",
  //             { class: "eyebrow" },
  //             h("span", { class: "live-dot" }),
  //             "Overseas Box Office",
  //             h("span", { class: "beta-tag" }, "Soon"),
  //           ),
  //         ),
  //       ),
  //       h(
  //         "div",
  //         { class: "ov-soon" },
  //         stateMsg(
  //           "globe",
  //           "Coming soon",
  //           "International box office tracking is on the way — territory-wise " +
  //             "collections for every title we follow.",
  //         ),
  //       ),
  //     ),
  //   );
  // }
  if (!ov) return null;

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

/* ============================================================
   GLOBAL TRACKING (USA)
   Fed by the Fandango collector's data/<date>/<slug>-summary.json,
   published to /overseas/<date>/<slug>-summary.json plus an index at
   /overseas/manifest.json (see publish_to_dashboard.py). Lives outside
   data/ because the India collector rewrites data/ wholesale.

   Home: a "Global Tracking" strip after All Movies (cards from the
   manifest only — no per-movie fetch). Card -> /global/<slug>/<date>,
   a detail page with the same tabbed Performance Breakdown as India
   movies: State · Top Theatres · Format · Language · Chain.
   Written defensively like overseas: any missing/odd file just hides
   the section instead of breaking the home page.
   ============================================================ */
