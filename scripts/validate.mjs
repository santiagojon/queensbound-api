#!/usr/bin/env node
// Validate subway JSON data invariants.
// Exit non-zero if any error-severity violation is found.
// Warnings print but do not affect the exit code.
// Run from any directory: node scripts/validate.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const stops = JSON.parse(readFileSync(join(root, 'subway-stops.json'), 'utf8'));
const artworks = JSON.parse(readFileSync(join(root, 'artworks.json'), 'utf8'));
const s2s = JSON.parse(readFileSync(join(root, 'stops-to-stations.json'), 'utf8'));

// Lines whose violations are surfaced as warnings and do not affect the exit code.
//
// reason: 'heuristic-inapplicable'
//   The geographic monotonicity check is geometrically meaningless for this line
//   (branched topology or missing coordinates). Do NOT fix these — the data is correct
//   for what the line is; removing from this allowlist is wrong.
//
// reason: 'defect-deferred'
//   A real ordering defect exists and is the same class as the 7-line bug, but it is
//   out of scope for this run. Remove from the allowlist when that line is fixed.
//
// The 7 Line is intentionally absent — its violations are errors that gate this run.
const ALLOWLIST = {
  'Air Train': {
    reason: 'heuristic-inapplicable',
    comment:
      'All coordinates are empty strings (placeholder data). ' +
      'Geographic checks cannot apply. Do not fix.',
  },
  'A Line': {
    reason: 'heuristic-inapplicable',
    comment:
      'Line branches at Rockaway Blvd (Lefferts Blvd branch vs. Rockaways). ' +
      'No single ordered array can be geographically monotonic for a branched line. ' +
      'Do not fix.',
  },
  'M Line': {
    reason: 'heuristic-inapplicable',
    comment:
      'Queens stops span two disjoint segments (line exits to Manhattan and re-enters). ' +
      'A single monotonic geographic run is impossible. ' +
      'Also has a real stop-order defect (Seneca Av / Forest Ave swap) deferred to a future run.',
  },
};

const DEFLECTION_THRESHOLD_DEG = 120;

const violations = [];

function record(severity, lineName, message) {
  violations.push({ severity, lineName, message });
}

function addViolation(lineName, message) {
  record(ALLOWLIST[lineName] ? 'warn' : 'error', lineName, message);
}

// Group stops by line, sorted ascending by line_order.
const stopsByLine = new Map();
for (const stop of stops) {
  for (const line of stop.subway_lines) {
    if (!stopsByLine.has(line.name)) stopsByLine.set(line.name, []);
    stopsByLine.get(line.name).push(stop);
  }
}
for (const lineStops of stopsByLine.values()) {
  lineStops.sort((a, b) => a.line_order - b.line_order);
}

const artworkIdSet = new Set(artworks.map((a) => a.id));
const stopIdSet = new Set(stops.map((s) => s.id));

// Returns deflection angle in degrees between two direction vectors,
// or null if either vector is zero-length (skips zero-length segments from duplicate coords).
function deflectionDeg(v1, v2) {
  const mag1 = Math.sqrt(v1.dx * v1.dx + v1.dy * v1.dy);
  const mag2 = Math.sqrt(v2.dx * v2.dx + v2.dy * v2.dy);
  if (!mag1 || !mag2) return null;
  const cosTheta = Math.max(-1, Math.min(1, (v1.dx * v2.dx + v1.dy * v2.dy) / (mag1 * mag2)));
  return Math.acos(cosTheta) * (180 / Math.PI);
}

// Per-line checks.
for (const [lineName, lineStops] of stopsByLine) {
  // Check 1: stationId uniqueness per line.
  const seenStationIds = new Map();
  for (const stop of lineStops) {
    if (seenStationIds.has(stop.stationId)) {
      const prev = seenStationIds.get(stop.stationId);
      addViolation(
        lineName,
        `[${lineName}] duplicate stationId ${stop.stationId}: ` +
          `id=${prev.id} "${prev.name}" (line_order ${prev.line_order}) ` +
          `and id=${stop.id} "${stop.name}" (line_order ${stop.line_order})`,
      );
    } else {
      seenStationIds.set(stop.stationId, stop);
    }
  }

  // Check 2: line_order uniqueness per line.
  const seenOrders = new Map();
  for (const stop of lineStops) {
    if (seenOrders.has(stop.line_order)) {
      const prev = seenOrders.get(stop.line_order);
      addViolation(
        lineName,
        `[${lineName}] duplicate line_order ${stop.line_order}: ` +
          `id=${prev.id} "${prev.name}" and id=${stop.id} "${stop.name}"`,
      );
    } else {
      seenOrders.set(stop.line_order, stop);
    }
  }

  // Check 3: no two consecutive stops (by line_order) share identical coordinates.
  for (let i = 0; i < lineStops.length - 1; i++) {
    const a = lineStops[i];
    const b = lineStops[i + 1];
    if (a.latitude === b.latitude && a.longitude === b.longitude) {
      addViolation(
        lineName,
        `[${lineName}] consecutive stops share identical coordinates ` +
          `(${a.latitude}, ${a.longitude}): ` +
          `"${a.name}" (line_order ${a.line_order}) ` +
          `and "${b.name}" (line_order ${b.line_order})`,
      );
    }
  }

  // Check 4: geographic monotonicity.
  // Computes the deflection angle between successive segment direction vectors.
  // A stop that doubles back > DEFLECTION_THRESHOLD_DEG signals a stop-order defect.
  // Zero-length segments (duplicate coords) are skipped to avoid NaN.
  // Threshold 120° separates the 7-line defect (144°/176° pre-fix, 68° post-fix)
  // from the N-line's known-good max curvature (34°).
  if (lineStops.length >= 3) {
    for (let i = 1; i < lineStops.length - 1; i++) {
      const prev = lineStops[i - 1];
      const curr = lineStops[i];
      const next = lineStops[i + 1];
      const v1 = {
        dx: Number(curr.longitude) - Number(prev.longitude),
        dy: Number(curr.latitude) - Number(prev.latitude),
      };
      const v2 = {
        dx: Number(next.longitude) - Number(curr.longitude),
        dy: Number(next.latitude) - Number(curr.latitude),
      };
      const angle = deflectionDeg(v1, v2);
      if (angle !== null && angle > DEFLECTION_THRESHOLD_DEG) {
        addViolation(
          lineName,
          `[${lineName}] geographic hairpin at "${curr.name}" (line_order ${curr.line_order}): ` +
            `${angle.toFixed(1)}° deflection — ` +
            `"${prev.name}" → "${curr.name}" → "${next.name}" ` +
            `(expected ≤${DEFLECTION_THRESHOLD_DEG}°)`,
        );
      }
    }
  }
}

// Check 5: every artwork_id on every stop resolves to a real artwork.
for (const stop of stops) {
  for (const artId of stop.artwork_ids) {
    if (!artworkIdSet.has(artId)) {
      record(
        'error',
        'global',
        `[global] stop id=${stop.id} "${stop.name}" references artwork id=${artId} ` +
          `not found in artworks.json`,
      );
    }
  }
}

// Check 6: every stopId in stops-to-stations.json resolves to a real stop.
for (const entry of s2s) {
  const stopId = Number(entry.stopId);
  if (!stopIdSet.has(stopId)) {
    record(
      'error',
      'global',
      `[global] stops-to-stations.json stopId="${entry.stopId}" ` +
        `("${entry.stationName}") does not resolve to any stop in subway-stops.json`,
    );
  }
}

// Print results.
const errors = violations.filter((v) => v.severity === 'error');
const warns = violations.filter((v) => v.severity === 'warn');

if (warns.length > 0) {
  console.log('Warnings (allowlisted lines — do not edit data for these):');
  for (const [lineName, entry] of Object.entries(ALLOWLIST)) {
    const count = warns.filter((w) => w.lineName === lineName).length;
    if (count > 0) {
      console.log(`  ${lineName} [${entry.reason}]: ${entry.comment}`);
    }
  }
  console.log('');
  for (const v of warns) console.log(`  WARN  ${v.message}`);
  console.log('');
}

if (errors.length > 0) {
  for (const v of errors) console.log(`  ERROR ${v.message}`);
  console.log('');
  console.log(
    `FAILED: ${errors.length} error(s)${warns.length > 0 ? `, ${warns.length} warning(s)` : ''}.`,
  );
  process.exit(1);
} else {
  console.log(
    `OK: 0 errors${warns.length > 0 ? `, ${warns.length} warning(s) on allowlisted lines` : ''}.`,
  );
  process.exit(0);
}
