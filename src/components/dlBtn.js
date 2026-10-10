import { h, icon } from "../core/dom.js";
import { DL } from "../core/exportState.js";

const loadExport = () => import("../features/export/exportImage.js");
const loadAssets = () => import("../features/export/assets.js");
const loadSheets = () => import("../features/export/sheets.js");

// direct (optional): () => ({ url }) | null. When it returns a url, that image
// is downloaded as-is instead of rasterising the section into a branded card.
// The export code is only downloaded on the first click.
export function dlBtn(section, cls, direct) {
  return h(
    "button",
    {
      class: "dl-btn" + (cls ? " " + cls : ""),
      title: "Download as PNG",
      onclick: async (e) => {
        const btn = e.currentTarget;
        const node = btn.closest(".block, .bd-panel, .perf-wrap");
        const sectionTitle =
          typeof section === "function" ? section() : section;
        btn.disabled = true;
        const [{ downloadImageFile, downloadSection }, { dlSlug }, { errSheet }] =
          await Promise.all([loadExport(), loadAssets(), loadSheets()]);
        btn.disabled = false;
        const name =
          dlSlug(["cbt", DL.ctx, sectionTitle].filter(Boolean).join("_")) +
          ".png";
        const d = typeof direct === "function" ? direct() : null;
        if (d && d.url) {
          downloadImageFile(d.url, name, btn);
          return;
        }
        if (node)
          downloadSection(node, sectionTitle, name, btn).catch((err) => {
            console.error(err);
            errSheet((err && err.message) || String(err));
            btn.disabled = false;
          });
      },
    },
    icon("download"),
    h("span", { class: "dl-label" }, "Download"),
  );
}
