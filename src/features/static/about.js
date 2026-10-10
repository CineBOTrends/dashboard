import { mount, page } from "../../components/chrome.js";
import { h } from "../../core/dom.js";

export const about = function () {
  mount(
    page(
      h(
        "div",
        { class: "wrap section" },
        h("div", { class: "eyebrow" }, "About"),
        h(
          "h2",
          {
            class: "display",
            style: "font-size:clamp(28px,5vw,46px);margin:8px 0 18px",
          },
          "About CineBOTrends",
        ),
        h(
          "p",
          {
            class: "muted",
            style: "max-width:640px;font-size:15px;line-height:1.7",
          },
          "CineBOTrends is a real-time box office intelligence dashboard for Indian cinema. It tracks advance bookings and daily collections across thousands of theatres, surfacing live occupancy, ticket sales, city and state breakdowns, theatre-level show timings and historical trends — all refreshed through the day from our automated data collector.",
        ),
        h(
          "p",
          {
            class: "muted",
            style: "max-width:640px;font-size:14px;margin-top:16px",
          },
          "Data is provided for informational and analytical purposes only.",
        ),
      ),
    ),
  );
};
