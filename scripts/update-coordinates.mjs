#!/usr/bin/env node
// Populate subway-stops.json latitude/longitude from MTA's official GTFS static
// feed (stops.txt), joining each stop by `stationId` (== the GTFS parent stop_id).
//
//   node scripts/update-coordinates.mjs
//
// AirTrain stops (airtrain-*) are not in the subway GTFS feed and are reported,
// not modified — set those by hand. No npm dependencies (Node built-ins + unzip).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadGtfsStations() {
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status}`);
  const dir = mkdtempSync(join(tmpdir(), "gtfs-"));
  const zipPath = join(dir, "gtfs.zip");
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const stopsTxt = execFileSync("unzip", ["-p", zipPath, "stops.txt"]).toString();
  rmSync(dir, { recursive: true, force: true });

  const map = new Map();
  for (const row of stopsTxt.trim().split("\n").slice(1)) {
    const [stopId, , lat, lon, locationType] = row.split(",");
    // location_type 1 = parent station (the id our data keys on)
    if (locationType === "1") map.set(stopId, { lat: Number(lat), lon: Number(lon) });
  }
  return map;
}

const gtfs = await loadGtfsStations();
const file = join(root, "subway-stops.json");
const stops = JSON.parse(readFileSync(file, "utf8"));

let updated = 0;
const unmatched = [];
for (const s of stops) {
  const g = gtfs.get(s.stationId);
  if (!g) {
    unmatched.push(`${s.name} (${s.stationId})`);
    continue;
  }
  if (s.latitude !== g.lat || s.longitude !== g.lon) updated++;
  s.latitude = g.lat;
  s.longitude = g.lon;
}

writeFileSync(file, JSON.stringify(stops, null, 2) + "\n");

console.log(
  `✅ subway-stops.json: ${updated} coordinate(s) updated; ${stops.length - unmatched.length}/${stops.length} matched to GTFS.`,
);
if (unmatched.length) {
  console.log(`⚠ ${unmatched.length} not in subway GTFS (set manually):`);
  unmatched.forEach((n) => console.log(`   - ${n}`));
}
