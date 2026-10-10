import { dlBtn } from "./dlBtn.js";
import { h } from "../core/dom.js";

export function block(title, hint, content) {
  return h(
    "div",
    { class: "block" },
    h(
      "div",
      { class: "block-hd" },
      h(
        "div",
        { class: "block-hd-t" },
        h("h3", null, title),
        hint && h("p", { class: "hint" }, hint),
      ),
      dlBtn(title),
    ),
    content,
  );
}
