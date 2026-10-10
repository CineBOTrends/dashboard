import { kpiCard } from "../../components/kpi.js";
import { frag, h, icon } from "../../core/dom.js";
import { inr, num, pct } from "../../core/format.js";

export function allIndiaContent(data) {
  const totals = data.totals || {};
  const territories = data.territories || [];
  const groups = data.groups || [];
  const byKey = new Map(territories.map((t) => [t.key, t]));

  // Groups carrying a "children" list (e.g. Nizam, with Hyderabad as a
  // child) replace their raw-territory members inline: the group's own
  // row takes the position of the first member that's still a raw
  // territory, immediately followed by its children as nested sub-rows.
  // Every other raw-territory member (e.g. Nizam Districts) is folded in
  // silently — it's already counted in the group's totals, it just isn't
  // shown as its own row. Groups without "children" keep the older
  // behaviour: a bold subtotal row appended right after the last
  // territory (or already-built group) that belongs to them.
  const nestedGroups = groups.filter((g) => g.children && g.children.length);
  const trailingGroups = groups.filter(
    (g) => !(g.children && g.children.length),
  );

  const anchorGroup = new Map(); // territory key -> nested group anchored there
  const hiddenKeys = new Set(); // territory keys folded in, never shown on their own
  nestedGroups.forEach((g) => {
    const memberKeys = (g.members || []).filter((k) => byKey.has(k));
    if (!memberKeys.length) return;
    const childKeys = new Set((g.children || []).map((c) => c.key));
    const anchor = memberKeys[0];
    anchorGroup.set(anchor, g);
    memberKeys.forEach((k) => {
      if (k !== anchor || !childKeys.has(k)) hiddenKeys.add(k);
    });
  });

  const lastMemberGroup = new Map();
  trailingGroups.forEach((g) => {
    const members = g.members || [];
    for (let i = members.length - 1; i >= 0; i--) {
      if (byKey.has(members[i])) {
        lastMemberGroup.set(members[i], g);
        break;
      }
    }
  });

  const groupNotes = groups.filter((g) => g.note).map((g) => g.note);

  const expanded = new Set(); // territory keys currently showing their movie split
  let tbody;

  const areaRow = (label, t, opts) => {
    opts = opts || {};
    const gross = t.gross,
      shows = t.shows,
      occ = t.occupancy;
    return h(
      "tr",
      {
        class:
          "terr-row" +
          (opts.sub ? " terr-sub-row" : "") +
          (opts.total ? " terr-total-row" : "") +
          (opts.clickable ? " clickable" : ""),
        onclick: opts.onclick || null,
      },
      h(
        "td",
        { class: opts.total ? "totcell" : "" },
        h(
          "span",
          { class: "terr-area" },
          opts.expandIcon != null
            ? icon(opts.expandIcon, "terr-caret")
            : null,
          label,
        ),
      ),
      h(
        "td",
        { class: "num gold" + (opts.total ? " totcell" : "") },
        inr(gross),
      ),
      h("td", { class: "num" + (opts.total ? " totcell" : "") }, num(shows)),
      h("td", { class: "num" + (opts.total ? " totcell" : "") }, pct(occ)),
    );
  };

  const movieRows = (t) =>
    (t.movies || []).map((mv) => {
      const m = String(mv.movie || "").match(/\(([^)]+)\)\s*$/);
      return areaRow(m ? m[1] : mv.movie, mv, { sub: true });
    });

  const stateRows = (t) =>
    (t.states || []).map((st) => areaRow(st.state, st, { sub: true }));

  const buildRows = () => {
    const rows = [];
    territories.forEach((t) => {
      // A nested group anchored here replaces this territory's own row.
      const ng = anchorGroup.get(t.key);
      if (ng) {
        rows.push(areaRow(ng.label, ng, { total: true }));
        (ng.children || []).forEach((c) => {
          rows.push(areaRow(c.label, c, { sub: true }));
        });
        return;
      }

      if (hiddenKeys.has(t.key)) return; // folded silently into a nested group above

      const hasMovies = t.movies && t.movies.length > 1;
      rows.push(
        areaRow(t.label, t, {
          clickable: hasMovies,
          expandIcon: hasMovies
            ? expanded.has(t.key)
              ? "angle-down"
              : "angle-right"
            : null,
          onclick: hasMovies
            ? () => {
                expanded.has(t.key)
                  ? expanded.delete(t.key)
                  : expanded.add(t.key);
                tbody.replaceChildren(...buildRows());
              }
            : null,
        }),
      );
      if (hasMovies && expanded.has(t.key)) rows.push(...movieRows(t));
      if (t.states && t.states.length) rows.push(...stateRows(t));
      const g = lastMemberGroup.get(t.key);
      if (g) rows.push(areaRow(g.label, g, { total: true }));
    });
    return rows;
  };

  tbody = h("tbody", null, ...buildRows());

  const table = h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "bo allindia" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Territory"),
          h("th", { class: "num" }, "Gross"),
          h("th", { class: "num" }, "Shows"),
          h("th", { class: "num" }, "Occ %"),
        ),
      ),
      tbody,
    ),
  );

  return frag(
    h(
      "div",
      { class: "kpi-grid allindia-kpis" },
      kpiCard(
        "Total Gross",
        inr(totals.gross),
        (totals.territories || territories.length) + " territories",
        "indian-rupee-sign",
        true,
      ),
      kpiCard("Total Shows", num(totals.shows), null, "clapperboard-play"),
      kpiCard("Occupancy", pct(totals.occupancy), "all-India", "chart-pie"),
      kpiCard(
        "Territories",
        num(totals.territories || territories.length),
        "tracked",
        "globe",
      ),
    ),
    groupNotes.length
      ? h("div", { class: "allindia-note" }, groupNotes.join(" "))
      : null,
    table,
  );
}
