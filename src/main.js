import { AUTO_REFRESH_MS, SPLASH_MS, SPLASH_REDUCED_MS } from "./core/config.js";
import { clearCache } from "./core/store.js";
import { startRouter } from "./core/router.js";
import { render } from "./core/routes.js";
import "./styles/index.css";

startRouter();

const splash = document.getElementById("splash");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Start fetching the home chunk while the splash plays.
if (location.pathname === "/" || location.pathname.startsWith("/home")) {
  import("./features/home/home.js");
}

setTimeout(
  () => {
    if (splash) {
      splash.classList.add("out");
      setTimeout(() => splash.remove(), 500);
    }
    if (location.pathname === "/" || location.pathname === "")
      history.replaceState(null, "", "/home" + location.hash);
    render();
  },
  reduce ? SPLASH_REDUCED_MS : SPLASH_MS,
);

// Keep an open tab fresh while it is visible.
setInterval(() => {
  if (document.hidden) return;
  clearCache();
  render();
}, AUTO_REFRESH_MS);
