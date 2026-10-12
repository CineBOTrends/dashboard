import { h } from "../core/dom.js";
import { go } from "../core/router.js";

/* Mobile "focus picker" menu: a full-screen list where the link under the
   finger / cursor grows large (with a bulge) and the others shrink away by
   distance. Reaching a link only focuses it; a tap / click opens the page.
   Dragging a finger across the list moves the focus along with it. */

const ITEMS = [
  ["Home", "/home"],
  ["Live Tracking", "/live", true],
  ["Advance Sales", "/advance"],
  ["Overseas Tracking", "/overseas"],
  ["Box Office Updates", "/boxoffice"],
  ["Multiplex", "/multiplex"],
  ["Movie News", "/news"],
  ["Movie Reviews", "/reviews"],
];

const NS = "http://www.w3.org/2000/svg";
function svgIcon(cls, d) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("class", cls);
  s.setAttribute("width", "28");
  s.setAttribute("height", "28");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", d);
  s.appendChild(p);
  return s;
}

export function buildFocusMenu() {
  const path = location.pathname.replace(/\/+$/, "") || "/home";
  let focus = ITEMS.findIndex(([, href]) => path === href || path.startsWith(href + "/"));
  if (focus < 0) focus = 0;

  const links = ITEMS.map(([label, href, live], i) =>
    h(
      "a",
      { class: "fp-pick", href, "data-d": "0" },
      label,
      live ? h("span", { class: "fp-dot", "aria-label": "live" }) : null,
    ),
  );
  const list = h(
    "ul",
    { class: "fp-list" },
    ...links.map((a, i) => h("li", { class: "fp-item", style: `--i:${i}` }, a)),
  );
  const overlay = h("nav", { class: "fp-menu", id: "fpMenu", "aria-label": "Main menu" }, list);
  const toggle = h("button", {
    class: "fp-toggle",
    type: "button",
    "aria-label": "Open menu",
    "aria-expanded": "false",
    "aria-controls": "fpMenu",
  });
  toggle.append(svgIcon("burger", "M4 8h16M4 16h16"), svgIcon("x", "M6 6l12 12M18 6L6 18"));

  let open = false;
  let navTimer = 0;

  const render = () =>
    links.forEach((a, i) => a.setAttribute("data-d", String(Math.min(Math.abs(i - focus), 7))));
  // the "bulge": a quick overshoot scale on the link that was just touched
  function bulge(a) {
    a.classList.remove("bulge");
    void a.offsetWidth; // restart the animation
    a.classList.add("bulge");
  }
  links.forEach((a) =>
    a.addEventListener("animationend", (e) => {
      if (e.animationName === "fpBulge") a.classList.remove("bulge");
    }),
  );
  function setFocus(i) {
    if (i !== focus) {
      focus = i;
      render();
    }
    bulge(links[focus]);
  }

  // Shrink every size by one common factor so the longest label, when it is
  // the focused (largest) one, still fits the screen width. Measured with the
  // real font, so it also holds on narrow phones and after rotation.
  function fit() {
    const avail = overlay.clientWidth - 56; // 28px padding on each side
    if (avail <= 0) return;
    let widest = 0;
    ITEMS.forEach(([label, , live]) => {
      const probe = h("span", { class: "fp-probe" }, label);
      overlay.append(probe);
      widest = Math.max(widest, probe.offsetWidth + (live ? 21 : 0));
      probe.remove();
    });
    overlay.style.setProperty("--fp-k", String(widest ? Math.min(1, avail / widest) : 1));
  }
  window.addEventListener("resize", () => open && fit());

  function setOpen(v) {
    open = v;
    overlay.classList.toggle("is-open", v);
    toggle.setAttribute("aria-expanded", String(v));
    toggle.setAttribute("aria-label", v ? "Close menu" : "Open menu");
    document.documentElement.style.overflow = v ? "hidden" : "";
    clearTimeout(navTimer);
    if (v) {
      fit();
      links[focus].focus({ preventScroll: true });
    }
  }
  toggle.addEventListener("click", () => setOpen(!open));

  // open the focused page once its bulge has played
  function openLink(i) {
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      setOpen(false);
      go(links[i].getAttribute("href"));
    }, 300);
  }

  let down = false;
  let scrubbed = false;
  let suppressClick = false;
  const indexAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const a = el && el.closest && el.closest(".fp-pick");
    return a ? links.indexOf(a) : -1;
  };

  links.forEach((a, i) => {
    // mouse: hovering moves the focus
    a.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && open) setFocus(i);
    });
    // touch / press: the link grows immediately
    a.addEventListener("pointerdown", () => {
      down = true;
      scrubbed = false;
      suppressClick = false;
      setFocus(i);
    });
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      openLink(i);
    });
  });

  // dragging a finger across the list moves the focus with it
  list.addEventListener("pointermove", (e) => {
    if (!down) return;
    const i = indexAt(e.clientX, e.clientY);
    if (i >= 0 && i !== focus) {
      scrubbed = true;
      setFocus(i);
    }
  });
  // Lifting the finger after a drag only leaves the focus where it is; the page
  // opens on a tap / click (not on reaching a link).
  const release = () => {
    if (down && scrubbed) suppressClick = true; // drag end is not a tap
    down = false;
    scrubbed = false;
  };
  list.addEventListener("pointerup", release);
  list.addEventListener("pointercancel", () => {
    down = false;
    scrubbed = false;
  });

  // keyboard: arrows move the focus, Escape closes
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focus = Math.max(0, Math.min(links.length - 1, focus + (e.key === "ArrowDown" ? 1 : -1)));
      render();
      bulge(links[focus]);
      links[focus].focus({ preventScroll: true });
    } else if (e.key === "Escape") {
      setOpen(false);
      toggle.focus();
    }
  });

  render();
  return { toggle, overlay };
}
