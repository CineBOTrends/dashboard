#!/usr/bin/env python3
"""
posters_from_bms.py  —  runs INSIDE your (private) data-collector repo.

Resolves each movie's BookMyShow poster from the by-event endpoint and writes a
`posters.json` that the CineBOTrends dashboard's build_data.py picks up automatically.

It uses ONLY these image fields, and only if they are present in the response:
    ImagePortraitUrl   -> portrait  -> card thumbnail + detail poster
    bannerUrl          -> wide      -> detail backdrop
    imageUrl           -> fallback for either
A movie with none of these is skipped (no poster, dashboard falls back to initials).

------------------------------------------------------------------------------
STEP 0 — get event codes (title -> ET code)
------------------------------------------------------------------------------
Your by-venue parser already iterates `Event` objects; each one carries an
`EventCode` (the ET… id). Capture it once. In scraper/parser.py, where you read
`title = ev.get("EventTitle", ...)`, also collect:

    EVENT_CODES = {}                       # module-level, or pass around
    ...
    EVENT_CODES[ev.get("EventTitle","")] = ev.get("EventCode","")

then dump it after a run:

    import json; json.dump(EVENT_CODES, open("eventcodes.json","w"), ensure_ascii=False, indent=2)

(If EventCode isn't on `ev`, run `print(list(ev.keys()))` once to find the right key.)

------------------------------------------------------------------------------
STEP 1 — CHECK the response before bulk-running
------------------------------------------------------------------------------
    python3 posters_from_bms.py --inspect ET00478884

This prints the discovered image fields and saves the raw JSON to
`bms_sample_ET00478884.json` so you can eyeball the exact field names/casing.
If the names differ, add them to IMAGE_KEYS below.

------------------------------------------------------------------------------
STEP 2 — build posters.json for everything
------------------------------------------------------------------------------
    python3 posters_from_bms.py --codes eventcodes.json --out posters.json

Then run the dashboard's builder; it reads posters.json from the collector root:
    python3 build_data.py /path/to/datacollector
------------------------------------------------------------------------------
"""

import argparse, json, re, sys, time

ENDPOINT = "https://in.bookmyshow.com/api/movies-data/showtimes-by-event"

# Region/date params the endpoint expects. COPY THE EXACT VALUES from your working
# request (DevTools -> Network -> this call -> Headers/Payload), since they vary by
# account/region. eventCode is filled in per movie.
BASE_PARAMS = {
    # "regionCode": "MUMBAI",
    # "subRegion":  "MUMBAI",
    # "bmsId":      "1.21...",
    # "dateCode":   "20260625",
}

# Image fields we accept (matched case-insensitively, anywhere in the JSON).
IMAGE_KEYS = {
    "portrait": ["imageportraiturl", "portraiturl", "verticalimageurl"],
    "banner":   ["bannerurl", "horizontalimageurl", "coverurl"],
    "any":      ["imageurl", "image", "posterurl"],
}

BMSCDN = "https://assets-in.bmscdn.com"

# Looks-like-an-image detector (used when key names don't match IMAGE_KEYS).
IMG_RE = re.compile(r"(bmscdn\.com|\.(?:jpg|jpeg|png|webp)(?:\?|$))", re.I)
PORTRAIT_HINTS = ("portrait", "vertical", "thumbnail", "poster", "/v-", "_v_")
BANNER_HINTS = ("banner", "listing", "horizontal", "landscape", "wide", "hero", "cover", "/h-", "_h_")


def looks_like_image(v):
    return isinstance(v, str) and v.strip() and IMG_RE.search(v)


def find_image_urls(obj, path="", out=None):
    """Walk JSON; return [(keypath, url)] for every image-looking string value."""
    if out is None:
        out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            find_image_urls(v, f"{path}.{k}" if path else str(k), out)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            find_image_urls(v, f"{path}[{i}]", out)
    elif looks_like_image(obj):
        out.append((path, obj.strip()))
    return out


def classify(keypath, url):
    """Return 'portrait' | 'banner' | 'any' from key path + url hints."""
    s = (keypath + " " + url).lower()
    if any(hint in s for hint in PORTRAIT_HINTS):
        return "portrait"
    if any(hint in s for hint in BANNER_HINTS):
        return "banner"
    return "any"


# --------------------------------------------------------------------------- #
def make_session():
    """Reuse the collector's Cloudflare-friendly session if available."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Origin": "https://in.bookmyshow.com",
        "Referer": "https://in.bookmyshow.com/",
        "Accept": "application/json, text/plain, */*",
    }
    try:
        import cloudscraper                      # your collector already uses this
        s = cloudscraper.create_scraper()
        s.headers.update(headers)
        return s
    except Exception:
        import requests
        s = requests.Session()
        s.headers.update(headers)
        return s


def fetch_event(session, event_code):
    params = dict(BASE_PARAMS)
    params["eventCode"] = event_code
    r = session.get(ENDPOINT, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def walk(obj, found):
    """Collect values whose key matches any image key (case-insensitive)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            lk = str(k).lower()
            if isinstance(v, str) and v.strip():
                for slot, names in IMAGE_KEYS.items():
                    if lk in names:
                        found.setdefault(slot, v.strip())
            walk(v, found)
    elif isinstance(obj, list):
        for x in obj:
            walk(x, found)
    return found


def to_url(val):
    """Full URL as-is; otherwise treat as a bmscdn path/id."""
    if not val:
        return None
    if val.startswith("http"):
        return val
    if val.startswith("/"):
        return BMSCDN + val
    # bare id/filename -> portrait path
    fn = val if val.endswith(".jpg") else val + ".jpg"
    return f"{BMSCDN}/iedb/movies/images/mobile/thumbnail/xlarge/{fn}"


def resolve_poster(resp):
    """Return {'thumb':.., 'bg':..} using ONLY the wanted fields, or None.

    1) Try the named fields in IMAGE_KEYS (ImagePortraitUrl / bannerUrl / imageUrl).
    2) If none matched, fall back to any BookMyShow image URL found anywhere in the
       response, classified into portrait / banner by url+key hints.
    """
    f = walk(resp, {})
    portrait = f.get("portrait") or f.get("any")
    banner = f.get("banner") or f.get("any")

    if not portrait and not banner:                       # fallback: scan for image URLs
        disc = {}
        for keypath, url in find_image_urls(resp):
            disc.setdefault(classify(keypath, url), url)
        portrait = disc.get("portrait") or disc.get("any")
        banner = disc.get("banner") or disc.get("any")

    if not portrait and not banner:
        return None
    thumb = to_url(portrait or banner)
    bg = to_url(banner or portrait)
    return {"thumb": thumb, "bg": bg}


# --------------------------------------------------------------------------- #
def cmd_inspect(args):
    s = make_session()
    code = args.inspect
    print(f"Fetching {code} …")
    try:
        resp = fetch_event(s, code)
    except Exception as e:
        print(f"  request failed: {e}")
        print("  -> copy the exact params/headers from your browser's Network tab "
              "into BASE_PARAMS, and make sure cloudscraper is installed.")
        sys.exit(1)
    out = f"bms_sample_{code}.json"
    json.dump(resp, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  raw response saved -> {out}")

    found = walk(resp, {})
    print("  named image fields (IMAGE_KEYS):")
    if found:
        for slot, val in found.items():
            print(f"    [{slot:8}] {val[:90]}")
    else:
        print("    (none matched)")

    disc = find_image_urls(resp)
    print(f"  image URLs discovered anywhere in response: {len(disc)}")
    for keypath, url in disc[:20]:
        print(f"    [{classify(keypath, url):8}] {keypath} = {url[:80]}")
    if not disc:
        print("    -> this endpoint returned NO image URLs. Images likely live on a different")
        print("       call (e.g. movies-data movie-details, or the event page's og:image).")
        print("       Share bms_sample_*.json and I'll point the script at the right field/endpoint.")

    poster = resolve_poster(resp)
    print("  -> poster:", json.dumps(poster, ensure_ascii=False) if poster else "skipped (no image)")


def cmd_build(args):
    codes = json.load(open(args.codes, encoding="utf-8"))
    if isinstance(codes, list):
        codes = {c: c for c in codes}
    s = make_session()
    posters, skipped, failed = {}, 0, 0
    for i, (title, code) in enumerate(codes.items(), 1):
        if not code or str(title).startswith("_"):
            continue
        try:
            resp = fetch_event(s, code)
            poster = resolve_poster(resp)
        except Exception as e:
            print(f"  [{i}/{len(codes)}] {title}: request failed ({e})")
            failed += 1
            time.sleep(args.delay)
            continue
        if poster:
            posters[title] = poster
            print(f"  [{i}/{len(codes)}] {title}: ok")
        else:
            skipped += 1
            print(f"  [{i}/{len(codes)}] {title}: no image, skipped")
        time.sleep(args.delay)

    posters["_comment"] = ("Generated by posters_from_bms.py from BookMyShow "
                           "showtimes-by-event (ImagePortraitUrl / bannerUrl / imageUrl).")
    json.dump(posters, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nwrote {args.out}: {len(posters)-1} posters, {skipped} skipped, {failed} failed")


def main():
    ap = argparse.ArgumentParser(description="Resolve BookMyShow posters into posters.json")
    ap.add_argument("--inspect", metavar="ET_CODE", help="fetch ONE event, dump JSON, show image fields")
    ap.add_argument("--codes", help="eventcodes.json mapping title -> ET code")
    ap.add_argument("--out", default="posters.json")
    ap.add_argument("--delay", type=float, default=0.6, help="seconds between requests")
    args = ap.parse_args()
    if args.inspect:
        cmd_inspect(args)
    elif args.codes:
        cmd_build(args)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
