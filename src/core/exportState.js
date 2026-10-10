

/* ---- section -> PNG export card -------------------------------------
   The PNG is NOT a screenshot of the section. We compose a branded card
   offscreen (logo + title + meta + summary chips + the section's table,
   over a tiled watermark), rasterise that, then throw it away.
   Filename: cbt_<slug>_<context>_<section>.png                        */
export const DL = { ctx: "", meta: {} }; // // "thandel_day_3" | "thandel_advance_13_jul" | "thandel_historical"
