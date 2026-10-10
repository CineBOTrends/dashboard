export const X_URL = "https://x.com/cinebotrends?s=11";

// Frontend understands data whose manifest.schemaVersion has this major version.
export const SUPPORTED_SCHEMA_MAJOR = 2;

export const AUTO_REFRESH_MS = 5 * 60 * 1000;
export const SPLASH_MS = 2400;
export const SPLASH_REDUCED_MS = 200;

// Short-TTL revalidation for JSON (NFR-5): within this window a repeat request
// reuses the in-flight/finished response; after it, the browser revalidates.
export const DATA_TTL_MS = 60 * 1000;

// Feature flag for the new data reader. While the pipeline dual-writes, the
// reader prefers the new layout and falls back to the legacy files.
export const NEW_DATA_LAYOUT = true;

export const DEFAULT_SHARE_IMAGE = "/public/assets/cbot_card.jpg";
