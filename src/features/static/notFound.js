import { mount, page } from "../../components/chrome.js";
import { stateMsg } from "../../components/states.js";
import { h } from "../../core/dom.js";

export const notFound = function () {
  mount(
    page(
      h(
        "div",
        { class: "wrap" },
        stateMsg(
          "triangle-warning",
          "Page not found",
          h("span", null, "That page doesn't exist. ", h("a", { href: "/home" }, "Go to the home page"), "."),
        ),
      ),
    ),
  );
};
