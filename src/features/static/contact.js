import { mount, page } from "../../components/chrome.js";
import { mi } from "../../components/kv.js";
import { h } from "../../core/dom.js";

export const contact = function () {
  mount(
    page(
      h(
        "div",
        { class: "wrap section" },
        h("div", { class: "eyebrow" }, "Contact"),
        h(
          "h2",
          {
            class: "display",
            style: "font-size:clamp(28px,5vw,46px);margin:8px 0 18px",
          },
          "Get in touch",
        ),
        h(
          "div",
          { class: "meta-grid", style: "max-width:560px" },
          mi("Support Email", "support@cinebotrends.example"),
          mi("X / Twitter", "@cinebotrends"),
          mi("Telegram", "t.me/cinebotrends"),
          mi("Instagram", "@cinebotrends"),
        ),
      ),
    ),
  );
};
