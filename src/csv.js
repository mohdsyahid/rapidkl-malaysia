#!/usr/bin/env node
/**
 * Minimal CSV parser for GTFS text files. GTFS fields are never quoted
 * with embedded commas/newlines in the Prasarana feeds, so a plain
 * split is enough - no need for a full RFC 4180 parser.
 */

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parses a GTFS CSV buffer/string into an array of row objects. */
function parseCsv(input) {
  const text = stripBom(typeof input === "string" ? input : input.toString("utf8"));
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    header.forEach((key, i) => {
      row[key] = values[i] ?? "";
    });
    return row;
  });
}

module.exports = { parseCsv, stripBom };
