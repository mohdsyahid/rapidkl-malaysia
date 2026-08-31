const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { pickRepresentativeTrips, buildRouteEntry } = require(path.join(__dirname, "..", "src", "generate.js"));
const { unzip } = require(path.join(__dirname, "..", "src", "unzip.js"));
const { parseCsv, stripBom } = require(path.join(__dirname, "..", "src", "csv.js"));

test("stripBom removes a leading UTF-8 BOM", () => {
  assert.strictEqual(stripBom("\uFEFFa,b"), "a,b");
  assert.strictEqual(stripBom("a,b"), "a,b");
});

test("parseCsv turns rows into objects keyed by header", () => {
  const rows = parseCsv("route_id,name\nAG,Ampang Line\nKJ,Kelana Jaya Line");
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { route_id: "AG", name: "Ampang Line" });
  assert.deepStrictEqual(rows[1], { route_id: "KJ", name: "Kelana Jaya Line" });
});

test("parseCsv handles an empty body", () => {
  assert.deepStrictEqual(parseCsv("route_id,name\n"), []);
});

test("pickRepresentativeTrips picks the trip with the most stops per direction", () => {
  const trips = [
    { trip_id: "t0-short", direction_id: "0" },
    { trip_id: "t0-long", direction_id: "0" },
    { trip_id: "t1-only", direction_id: "1" },
  ];
  const stopTimesByTrip = new Map([
    ["t0-short", [{ stop_sequence: "1" }]],
    ["t0-long", [{ stop_sequence: "1" }, { stop_sequence: "2" }, { stop_sequence: "3" }]],
    ["t1-only", [{ stop_sequence: "1" }, { stop_sequence: "2" }]],
  ]);
  const picked = pickRepresentativeTrips(trips, stopTimesByTrip);
  assert.strictEqual(picked.length, 2);
  assert.ok(picked.some((t) => t.trip_id === "t0-long"));
  assert.ok(picked.some((t) => t.trip_id === "t1-only"));
  assert.ok(!picked.some((t) => t.trip_id === "t0-short"));
});

test("buildRouteEntry orders stops by stop_sequence and resolves stop names", () => {
  const route = { route_id: "AG", route_short_name: "AGL", route_long_name: "LRT Ampang Line", category: "LRT", route_color: "e57200" };
  const trips = [{ trip_id: "trip-0", route_id: "AG", direction_id: "0", trip_headsign: "To Sentul Timur" }];
  const stopTimesByTrip = new Map([
    [
      "trip-0",
      [
        { stop_id: "AG18", stop_sequence: "2" },
        { stop_id: "AG17", stop_sequence: "1" },
      ],
    ],
  ]);
  const stopsById = new Map([
    ["AG18", { stop_name: "AMPANG", stop_lat: "3.15", stop_lon: "101.76" }],
    ["AG17", { stop_name: "CAHAYA", stop_lat: "3.14", stop_lon: "101.75" }],
  ]);

  const entry = buildRouteEntry(route, trips, stopTimesByTrip, stopsById);
  assert.strictEqual(entry.routeId, "AG");
  assert.strictEqual(entry.color, "#e57200");
  assert.strictEqual(entry.directions.length, 1);
  assert.deepStrictEqual(
    entry.directions[0].stops.map((s) => s.stopId),
    ["AG17", "AG18"],
  );
});

test("unzip reads a minimal stored (uncompressed) ZIP archive", () => {
  // Hand-built ZIP: one stored entry "hello.txt" containing "hi".
  const zlib = require("zlib");
  const content = Buffer.from("hi");
  const crc = require("zlib").crc32 ? zlib.crc32(content) : crc32Fallback(content);
  const fileName = Buffer.from("hello.txt");

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(0, 8); // compression: stored
  localHeader.writeUInt16LE(0, 10); // time
  localHeader.writeUInt16LE(0, 12); // date
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(content.length, 18); // compressed size
  localHeader.writeUInt32LE(content.length, 22); // uncompressed size
  localHeader.writeUInt16LE(fileName.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra length

  const localEntry = Buffer.concat([localHeader, fileName, content]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(0, 10); // compression: stored
  centralHeader.writeUInt16LE(0, 12); // time
  centralHeader.writeUInt16LE(0, 14); // date
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(fileName.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra length
  centralHeader.writeUInt16LE(0, 32); // comment length
  centralHeader.writeUInt16LE(0, 34); // disk number
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(0, 42); // local header offset

  const centralEntry = Buffer.concat([centralHeader, fileName]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralEntry.length, 12); // central dir size
  eocd.writeUInt32LE(localEntry.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  const zip = Buffer.concat([localEntry, centralEntry, eocd]);
  const files = unzip(zip);
  assert.strictEqual(files.size, 1);
  assert.strictEqual(files.get("hello.txt").toString("utf8"), "hi");
});

function crc32Fallback(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}
