#!/usr/bin/env node
/**
 * Fetch RapidKL's official GTFS static feeds (rail/LRT/MRT/Monorail/BRT,
 * city buses, and MRT feeder buses) from data.gov.my, and turn them into
 * a simpler per-line JSON API: one file per feed listing every route with
 * its ordered stop sequence for each direction.
 *
 * Re-run this any time (manually or via the scheduled GitHub Action) to
 * refresh the data - it's fully idempotent, each run overwrites the
 * previous output from scratch.
 *
 * Note: GTFS has no fare data (no fare_attributes.txt/fare_rules.txt in
 * any of these feeds), and RapidKL's own fare pages are behind a bot
 * challenge, so this project covers routes/lines/stops only, not fares.
 */

const fs = require("fs");
const path = require("path");
const { unzip } = require("./unzip");
const { parseCsv } = require("./csv");

const GTFS_BASE = "https://api.data.gov.my/gtfs-static/prasarana/";
const OUTPUT_DIR = path.join(__dirname, "..", "docs", "data");
const USER_AGENT = "rapidkl-malaysia/1.0 (github.com/mohdsyahid)";

const FEEDS = [
  { category: "rapid-rail-kl", outputFile: "rail.json", label: "LRT / MRT / Monorail / BRT" },
  { category: "rapid-bus-kl", outputFile: "bus-kl.json", label: "RapidKL city buses" },
  { category: "rapid-bus-mrtfeeder", outputFile: "bus-mrtfeeder.json", label: "MRT feeder buses" },
];

async function fetchGtfsZip(category) {
  const response = await fetch(`${GTFS_BASE}?category=${category}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${category}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function readCsvFile(files, name) {
  const buf = files.get(name);
  return buf ? parseCsv(buf) : [];
}

/** Picks one representative trip per direction_id for a route - the one
 * with the most stop_times rows, since some trips are truncated/express
 * variants and we want the fullest stop sequence to represent the line. */
function pickRepresentativeTrips(routeTrips, stopTimesByTrip) {
  const byDirection = new Map();
  for (const trip of routeTrips) {
    const stopCount = (stopTimesByTrip.get(trip.trip_id) || []).length;
    if (stopCount === 0) continue;
    const existing = byDirection.get(trip.direction_id);
    if (!existing || stopCount > existing.stopCount) {
      byDirection.set(trip.direction_id, { trip, stopCount });
    }
  }
  return [...byDirection.values()].map((v) => v.trip);
}

function buildRouteEntry(route, trips, stopTimesByTrip, stopsById) {
  const routeTrips = trips.filter((t) => t.route_id === route.route_id);
  const representatives = pickRepresentativeTrips(routeTrips, stopTimesByTrip);

  const directions = representatives
    .sort((a, b) => a.direction_id.localeCompare(b.direction_id))
    .map((trip) => {
      const stopTimes = (stopTimesByTrip.get(trip.trip_id) || []).sort(
        (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence),
      );
      return {
        headsign: trip.trip_headsign || null,
        stops: stopTimes.map((st) => {
          const stop = stopsById.get(st.stop_id);
          return {
            stopId: st.stop_id,
            name: stop ? stop.stop_name : null,
            lat: stop ? Number(stop.stop_lat) || null : null,
            lon: stop ? Number(stop.stop_lon) || null : null,
          };
        }),
      };
    });

  return {
    routeId: route.route_id,
    shortName: route.route_short_name || null,
    longName: route.route_long_name || null,
    category: route.category || null,
    color: route.route_color ? `#${route.route_color}` : null,
    directions,
  };
}

async function processFeed(feed) {
  process.stdout.write(`Fetching ${feed.label} (${feed.category})... `);
  const zipBuffer = await fetchGtfsZip(feed.category);
  const files = unzip(zipBuffer);

  const routes = readCsvFile(files, "routes.txt");
  const stops = readCsvFile(files, "stops.txt");
  const trips = readCsvFile(files, "trips.txt");
  const stopTimes = readCsvFile(files, "stop_times.txt");

  const stopsById = new Map(stops.map((s) => [s.stop_id, s]));
  const stopTimesByTrip = new Map();
  for (const st of stopTimes) {
    if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
    stopTimesByTrip.get(st.trip_id).push(st);
  }

  const dedupedStops = [...stopsById.values()];
  const routeEntries = routes.map((route) => buildRouteEntry(route, trips, stopTimesByTrip, stopsById));

  console.log(`OK (${routeEntries.length} routes, ${dedupedStops.length} stops)`);

  return {
    feed: feed.category,
    label: feed.label,
    generatedAt: new Date().toISOString(),
    source: "data.gov.my GTFS static (Prasarana) - https://api.data.gov.my/gtfs-static/prasarana",
    routeCount: routeEntries.length,
    stopCount: dedupedStops.length,
    routes: routeEntries,
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const feedIndex = [];
  let failures = 0;

  for (const feed of FEEDS) {
    try {
      const payload = await processFeed(feed);
      fs.writeFileSync(path.join(OUTPUT_DIR, feed.outputFile), JSON.stringify(payload, null, 2));
      feedIndex.push({
        feed: feed.category,
        label: feed.label,
        file: feed.outputFile,
        routeCount: payload.routeCount,
        stopCount: payload.stopCount,
      });
    } catch (err) {
      failures += 1;
      console.log(`FAILED: ${err.message}`);
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "feeds.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), feeds: feedIndex }, null, 2),
  );

  console.log(`\nDone. ${feedIndex.length}/${FEEDS.length} feeds written, ${failures} failure(s).`);
  if (failures > 0 && feedIndex.length === 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  });
}

module.exports = { pickRepresentativeTrips, buildRouteEntry };
