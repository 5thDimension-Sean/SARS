import test from "node:test";
import assert from "node:assert/strict";
import { COORDINATE_STARTERS, validCoordinate, processingEndpoint, isJobStatus } from "../lib/coordinate-request.ts";

test("ten supported shortcuts without the archived Iowa study", () => {
  assert.equal(COORDINATE_STARTERS.length, 10);
  assert.equal(new Set(COORDINATE_STARTERS.map(p => p.name)).size, 10);
  assert.ok(COORDINATE_STARTERS.some(p => p.name === "Padma River, Bangladesh" && p.latitude === 23.75 && p.longitude === 90.05));
  assert.ok(COORDINATE_STARTERS.every(p => !p.name.includes("Iowa") && validCoordinate(String(p.latitude), String(p.longitude))));
});
test("coordinates reject blanks, nonfinite numbers and antimeridian-crossing footprints", () => {
  for (const [lat, lon] of [["", "0"], ["0", " "], ["NaN", "0"], ["Infinity", "0"], ["85.01", "0"], ["0", "180"], ["0", "-180"], ["85", "179.9"]]) assert.equal(validCoordinate(lat, lon), false);
  for (const [lat, lon] of [["25.5", "-80.8"], ["-85", "0"], ["85", "179.7"], ["0", "0"]]) assert.equal(validCoordinate(lat, lon), true);
});
test("tokens can only go to HTTPS or development loopback endpoints", () => {
  for (const url of ["http://worker.example", "https://user:secret@worker.example", "https://worker.example?token=secret", "https://worker.example#fragment", "not a URL", "http://localhost:8090"]) assert.equal(processingEndpoint(url, false), "");
  assert.equal(processingEndpoint("https://worker.example/", false), "https://worker.example");
  assert.equal(processingEndpoint("http://127.0.0.1:8090", true), "http://127.0.0.1:8090");
  assert.equal(processingEndpoint("http://localhost.evil.test:8090", true), "");
  assert.ok(isJobStatus("generating"));
  assert.equal(isJobStatus("arbitrary"), false);
});
