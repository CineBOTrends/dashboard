#!/usr/bin/env python3
"""
discovery_to_meta.py  —  runs INSIDE your (private) data-collector repo.

Reads one or many BookMyShow getDiscoveryData responses
(https://cinemas.bookmyshow.com/api/getDiscoveryData?region=<CODE>) and writes,
for the CineBOTrends dashboard:

    posters.json    title -> {thumb, bg}            (poster + backdrop)
    metadata.json   title -> {genres, runTime, certification, languages, formats, eventCode, likes}

build_data.py picks both up automatically (same folder as the collector, or the
dashboard root). Fields are used ONLY when present in the response.

------------------------------------------------------------------------------
CAPTURE (while you track the 9 shards)
------------------------------------------------------------------------------
For each region you already scrape, also hit getDiscoveryData once and save it:

    GET https://cinemas.bookmyshow.com/api/getDiscoveryData?region=BANG
    -> save to discovery/BANG.json   (one file per region code)

Use the same Cloudflare-friendly session your shards already use. The region codes
are BMS's short codes (BANG, MUMBAI, HYD, CHEN, …) — the same region you pass per shard.

------------------------------------------------------------------------------
BUILD
------------------------------------------------------------------------------
    python3 discovery_to_meta.py discovery/            # a folder of <REGION>.json
    python3 discovery_to_meta.py getDiscoveryData.json # or a single file

Then:  python3 build_data.py /path/to/datacollector
------------------------------------------------------------------------------
"""

import argparse, glob, json, os, re, sys
from collections import OrderedDict


def landscape_of(url):
    """Derive a wide image from a portrait poster URL (BMS keeps both); harmless if it 404s."""
    if not url:
        return None
    for a, b in (("-portrait", "-landscape"), ("/portrait/", "/landscape/")):
        if a in url:
            return url.replace(a, b)
    return url


def norm_title(t):
    return re.sub(r"\s+", " ", (t or "").strip())


def merge_listing(item, posters, meta):
    title = norm_title(item.get("title"))
    if not title:
        return
    poster = item.get("defaultPosterImage")
    variants = item.get("variants") or []
    langs, formats = [], []
    run_time = cert = None
    for v in variants:
        lg = (v.get("language") or "").strip()
        fm = (v.get("format") or "").strip()
        if lg and lg.lower() not in [x.lower() for x in langs]:
            langs.append(lg.title())
        if fm and fm not in formats:
            formats.append(fm)
        run_time = run_time or (v.get("runTime") or "").strip() or None
        cert = cert or (v.get("censorRating") or "").strip() or None
        poster = poster or v.get("images")

    if title not in posters and poster:
        posters[title] = {"thumb": poster, "bg": landscape_of(poster)}

    if title not in meta:
        info = item.get("infoBar") or {}
        meta[title] = {
            "genres": [g.title() for g in (item.get("genres") or [])],
            "runTime": run_time,
            "certification": cert,
            "languages": langs,
            "formats": formats,
            "eventCode": item.get("defaultEventCode"),
            "likes": info.get("title"),
        }
    else:                                   # merge extra languages/formats from other regions
        m = meta[title]
        for lg in langs:
            if lg.lower() not in [x.lower() for x in m["languages"]]:
                m["languages"].append(lg)
        for fm in formats:
            if fm not in m["formats"]:
                m["formats"].append(fm)


def load_files(path):
    if os.path.isdir(path):
        files = sorted(glob.glob(os.path.join(path, "*.json")))
    else:
        files = [path]
    out = []
    for f in files:
        try:
            out.append((f, json.load(open(f, encoding="utf-8"))))
        except Exception as e:
            print(f"  ! skip {f}: {e}")
    return out


def main():
    ap = argparse.ArgumentParser(description="getDiscoveryData -> posters.json + metadata.json")
    ap.add_argument("path", help="a getDiscoveryData json file OR a folder of <REGION>.json")
    ap.add_argument("--posters", default="posters.json")
    ap.add_argument("--metadata", default="metadata.json")
    args = ap.parse_args()

    files = load_files(args.path)
    if not files:
        print("no JSON found at", args.path); sys.exit(1)

    posters, meta = OrderedDict(), OrderedDict()
    total_items = 0
    for fname, data in files:
        listing = data.get("listing") if isinstance(data, dict) else None
        if not listing:
            print(f"  ! {os.path.basename(fname)}: no 'listing' array"); continue
        for item in listing:
            merge_listing(item, posters, meta)
        total_items += len(listing)
        print(f"  + {os.path.basename(fname)}: {len(listing)} movies")

    posters["_comment"] = "Generated by discovery_to_meta.py from BookMyShow getDiscoveryData."
    meta["_comment"] = "Generated by discovery_to_meta.py — genres/runtime/certification per movie title."
    json.dump(posters, open(args.posters, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(meta, open(args.metadata, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n{total_items} listings across {len(files)} region file(s)")
    print(f"wrote {args.posters}  ({len(posters)-1} posters)")
    print(f"wrote {args.metadata} ({len(meta)-1} movies with metadata)")


if __name__ == "__main__":
    main()
