export function grp(n) {
  n = Math.round(Number(n) || 0);
  const s = String(Math.abs(n));
  let out;
  if (s.length <= 3) out = s;
  else {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = rest + "," + last3;
  }
  return (n < 0 ? "-" : "") + out;
}
// rupees -> Cr / L compact
export function inr(v) {
  v = Number(v) || 0;
  if (v >= 1e7) return "₹" + (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return "₹" + (v / 1e5).toFixed(2) + " L";
  return "₹" + grp(v);
}
export const pct = (v) => (Number(v) || 0).toFixed(1) + "%";
export const num = (v) => grp(v);

export function fmtDate(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || "";
  const d = new Date(
    +ymd.slice(0, 4),
    +ymd.slice(4, 6) - 1,
    +ymd.slice(6, 8),
  );
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
export function fmtDateLong(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || "";
  const d = new Date(
    +ymd.slice(0, 4),
    +ymd.slice(4, 6) - 1,
    +ymd.slice(6, 8),
  );
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
// "2026-06-29 13:31 IST" -> "29 Jun 2026, 1:31 PM"
export function fmtUpdated(s) {
  if (!s) return "";
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(s);
  const [, Y, Mo, D, H, Mi] = m.map(Number);
  const d = new Date(Y, Mo - 1, D, H, Mi);
  if (isNaN(d)) return String(s);
  const datePart = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = d
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s*(am|pm)$/i, (x) => " " + x.trim().toUpperCase());
  return `${datePart}, ${timePart}`;
}

// "2026-06-20" -> "20 Jun 2026"
export function fmtReleaseDate(s) {
  if (!s) return "";
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
