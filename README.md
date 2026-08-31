# 🚈 RapidKL Malaysia

[![CI](https://github.com/mohdsyahid/rapidkl-malaysia/actions/workflows/ci.yml/badge.svg)](https://github.com/mohdsyahid/rapidkl-malaysia/actions/workflows/ci.yml)
[![Update route data](https://github.com/mohdsyahid/rapidkl-malaysia/actions/workflows/update-data.yml/badge.svg)](https://github.com/mohdsyahid/rapidkl-malaysia/actions/workflows/update-data.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live page: https://mohdsyahid.github.io/rapidkl-malaysia/**

Static JSON API + web page for RapidKL's rail and bus network — every line and route with its full, ordered stop sequence. Covers **LRT, MRT, Monorail, and BRT** (8 lines), **RapidKL city buses** (137 routes), and **MRT feeder buses** (92 routes). Data auto-refreshes weekly via GitHub Actions — no server, no cost, no maintenance.

## Why

Prasarana/RapidKL publishes an official GTFS static feed on [data.gov.my](https://api.data.gov.my/gtfs-static/prasarana), but raw GTFS is a relational format (routes/trips/stop_times/stops split across files) that's awkward to consume directly for a simple "what stations does this line hit" lookup. This project turns it into:

- **A static JSON API** — one file per transport type, each route pre-joined with its ordered stop list per direction, served free by GitHub Pages. Your app just `fetch()`es a URL.
- **A simple web page** — pick a transport type and a line/route, see its stations in order with a direction switcher.
- **Weekly automation** — a scheduled action re-fetches all three GTFS feeds and commits any changes.

## The JSON API

All data lives under `docs/data/`:

| URL | Content |
|---|---|
| `data/feeds.json` | Index of all feeds (file, label, route/stop counts) |
| `data/rail.json` | LRT, MRT, Monorail, BRT — 8 lines |
| `data/bus-kl.json` | RapidKL city bus routes |
| `data/bus-mrtfeeder.json` | MRT feeder bus routes |

Example — LRT Ampang Line, from `data/rail.json`:

```json
{
  "routeId": "AG",
  "shortName": "AGL",
  "longName": "LRT Ampang Line",
  "category": "LRT",
  "color": "#e57200",
  "directions": [
    {
      "headsign": "From Ampang to Sentul Timur",
      "stops": [
        { "stopId": "AG18", "name": "AMPANG", "lat": 3.150318, "lon": 101.760049 },
        { "stopId": "AG17", "name": "CAHAYA", "lat": 3.140575, "lon": 101.756677 }
      ]
    }
  ]
}
```

Each route lists one representative trip per direction (the fullest stop sequence available in the source GTFS), not a live timetable.

## Running it yourself

Requires Node 18+ (uses built-in `fetch`, zero dependencies — includes its own minimal ZIP reader and CSV parser to unpack the GTFS feeds without a third-party library):

```bash
git clone https://github.com/mohdsyahid/rapidkl-malaysia.git
cd rapidkl-malaysia
npm run generate   # downloads all 3 GTFS feeds, writes docs/data/*.json
npm test           # run the test suite (node:test)
```

## How the weekly update works

[`update-data.yml`](.github/workflows/update-data.yml) runs every Monday at 03:00 MYT, re-downloads the GTFS feeds for rail, city buses, and MRT feeder buses, and commits any changes to `docs/data/`. Route/station changes (new line extensions, route revisions) are infrequent enough that weekly is plenty.

## Project structure

```
rapidkl-malaysia/
├── docs/                      # served by GitHub Pages
│   ├── index.html              # web page (transport type + line picker)
│   └── data/*.json              # the static JSON API (generated)
├── src/
│   ├── unzip.js                  # minimal dependency-free ZIP reader
│   ├── csv.js                    # minimal GTFS CSV parser
│   └── generate.js               # fetch GTFS zips + build per-line JSON
├── tests/generate.test.js       # node:test suite
└── .github/workflows/
    ├── ci.yml                    # tests on every push/PR
    └── update-data.yml            # weekly regeneration
```

## Known limitation — no fare data

This project covers **routes, lines, and stop sequences only — not fares**. GTFS static feeds normally support `fare_attributes.txt`/`fare_rules.txt`, but none of Prasarana's three feeds include them. RapidKL's own fare pages on [myrapid.com.my](https://myrapid.com.my) are protected by a bot-detection challenge (Imperva/hCaptcha) that requires a human to solve, so fare data can't be reliably scraped for an auto-updating feed. For fares, use RapidKL's own fare calculator or app directly.

## Data source & disclaimer

All route data is fetched from [data.gov.my's GTFS static feed for Prasarana](https://api.data.gov.my/gtfs-static/prasarana), Malaysia's official open-data portal. This project is not affiliated with Prasarana, RapidKL, or data.gov.my. For live arrivals, disruptions, or fares, always refer to [myrapid.com.my](https://myrapid.com.my) or the official RapidKL app.

## Contributing

Issues and PRs welcome — data corrections, new output formats (GeoJSON for the map-inclined?), or a nicer UI. `npm test` should pass before submitting.

## License

[MIT](LICENSE)
