import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const learning = JSON.parse(
  readFileSync(new URL("../data/sar-learning.json", import.meta.url), "utf8"),
);
const sample = JSON.parse(
  readFileSync(new URL("../data/sample-data.json", import.meta.url), "utf8"),
);
test("learning content is pure JSON, cites NASA Earthdata and paraphrases", () => {
  assert.match(learning.source.url, /^https:\/\/www\.earthdata\.nasa\.gov\//);
  const ids = new Set(learning.topics.map((t) => t.id));
  assert.equal(ids.size, learning.topics.length);
  for (const required of [
    "active-sensing",
    "backscatter",
    "wavelength",
    "polarization",
    "scattering",
    "moisture",
    "interferometry",
    "limits",
  ])
    assert.ok(ids.has(required), required);
  for (const t of learning.topics) assert.ok(t.detail.length < 600);
  const limits = learning.topics.find((t) => t.id === "limits");
  for (const word of ["speckle", "shadow", "layover", "foreshortening"])
    assert.match(limits.detail.toLowerCase(), new RegExp(word));
});
test("every phenomenon has mode notes with the required units", () => {
  for (const p of sample.phenomena) {
    const note = learning.modeNotes[p.id];
    assert.ok(note, p.id);
    assert.match(
      note.unit,
      p.analysis === "displacement" ? /\(cm\)/ : /\(dB\)/,
    );
  }
});
test("no learning copy implies a live feed", () => {
  assert.doesNotMatch(JSON.stringify(learning), /\b(live|real-time|streaming)\b/i);
});
