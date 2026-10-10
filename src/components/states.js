import { page } from "./chrome.js";
import { frag, h, icon } from "../core/dom.js";

export function stateMsg(ic, title, body) {
  return h(
    "div",
    { class: "state-msg" },
    h("div", { class: "ic" }, icon(ic)),
    h("h3", null, title),
    body && h("p", null, body),
  );
}
export function loading() {
  return h("div", { class: "loading" }, h("div", { class: "spinner" }));
}

export function fetchError(err) {
  const offline =
    String((err && err.message) || "").includes("Failed to fetch") ||
    location.protocol === "file:";
  return page(
    h(
      "div",
      { class: "wrap" },
      stateMsg(
        "triangle-warning",
        offline
          ? "Run a local server to load data"
          : "Couldn't load this view",
        offline
          ? frag(
              "The dashboard reads JSON from the data folder, which browsers block on file://. Start a server in this folder: ",
              h("code", null, "python3 -m http.server"),
              " then open ",
              h("code", null, "http://localhost:8000"),
              ".",
            )
          : "Try refreshing. If it persists, rebuild the data with build_data.py.",
      ),
    ),
  );
}
