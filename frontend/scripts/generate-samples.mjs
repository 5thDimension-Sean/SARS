import { mkdirSync, writeFileSync } from "node:fs";
const dates = [
  "2026-07-03",
  "2026-07-15",
  "2026-07-27",
  "2026-08-08",
  "2026-08-20",
  "2026-09-13",
  "2026-09-25",
];
const definitions = [
  {
    id: "wetland",
    label: "Wetland loss",
    shortLabel: "WETLANDS",
    description: "Water & vegetation change",
    analysis: "backscatter",
    explanation:
      "Radar responds to water, vegetation, and surface roughness. Amber patches illustrate a decrease in backscatter between acquisitions. A shift in the distribution can flag areas for closer review.",
    limitation:
      "A backscatter decrease is not proof of wetland loss. Water level, season, and viewing geometry also change the signal.",
    locations: [
      [
        "W-01",
        "Freshwater mosaic",
        "Everglades · Florida",
        25.6153,
        -80.7031,
        ["everglades", "florida", "p33"],
        281,
      ],
      [
        "W-02",
        "Tidal delta mosaic",
        "Sundarbans · India",
        21.9052,
        88.6191,
        ["sundarbans", "india", "delta"],
        324,
      ],
    ],
  },
  {
    id: "earthquake",
    label: "Earthquakes",
    shortLabel: "SEISMIC",
    description: "Surface displacement",
    analysis: "displacement",
    explanation:
      "Interferometry compares radar phase between repeat passes to estimate movement toward or away from the satellite. The colors illustrate displacement; the profile follows movement across a sample fault corridor.",
    limitation:
      "Illustrative GUNW-style analysis, not a real earthquake or warning. GCOV cannot measure displacement. Atmospheric effects and phase unwrapping affect real estimates.",
    locations: [
      [
        "E-01",
        "Fault corridor A",
        "Parkfield · California",
        35.8942,
        -120.4212,
        ["parkfield", "california", "san andreas"],
        196,
      ],
      [
        "E-02",
        "Fault corridor B",
        "Hayward · California",
        37.68,
        -122.092,
        ["hayward", "bay area", "san francisco"],
        218,
      ],
    ],
  },
  {
    id: "forest",
    label: "Deforestation",
    shortLabel: "FORESTS",
    description: "Canopy & backscatter change",
    analysis: "backscatter",
    explanation:
      "L-band radar is sensitive to forest structure and moisture. Geometric patches illustrate where canopy disturbance might shift the backscatter distribution. Compare HV to explore vegetation scattering.",
    limitation:
      "These patches are invented. Moisture, flooding, and processing differences can mimic forest change; real loss needs independent validation.",
    locations: [
      [
        "F-01",
        "Forest frontier A",
        "Rondônia · Brazil",
        -10.1277,
        -63.6783,
        ["rondonia", "rondônia", "brazil", "ariquemes", "amazon"],
        412,
      ],
      [
        "F-02",
        "Forest frontier B",
        "Tapajós · Brazil",
        -2.9515,
        -54.9595,
        ["tapajos", "tapajós", "para", "santarem"],
        368,
      ],
    ],
  },
];
const sources = [
  "https://fl.water.usgs.gov/PDF_files/wri03_4287_swain.pdf",
  "https://www.unesco.org/en/mab/sunderban",
  "https://escweb.wr.usgs.gov/nsmp-data/GEOS/prk/parkfield_station.html",
  "https://earthquake.usgs.gov/monitoring/deformation/data/download.php",
  "https://daac.ornl.gov/LBA/guides/ND01_Georectified_Products.html",
  "https://daac.ornl.gov/VEGETATION/guides/Forested_Areas_Para_Brazil.html",
];
const phenomena = definitions.map((p, pi) => ({
  ...p,
  locations: p.locations.map(
    ([id, label, region, latitude, longitude, aliases, areaKm2], li) => ({
      id,
      label,
      region,
      aliases,
      coordinates: { latitude, longitude },
      coordinateSource: sources[pi * 2 + li],
      coordinateMethod: pi === 2 ? "bounds_midpoint" : "reported",
      areaKm2,
      textureSeed: 13 + pi * 17 + li * 29,
      acquisitions: dates.map((date, i) => {
        const displacement = p.analysis === "displacement",
          strength = 0.7 + li * 0.19;
        const hhMean = p.id === "forest" ? 10.5 : 13,
          hvMean = p.id === "forest" ? 16 : 19,
          rate = p.id === "forest" ? 0.7 : 0.5;
        const bins = Array.from({ length: 26 }, (_, b) => {
          const db = -30 + b * 1.2;
          return {
            db: +db.toFixed(1),
            HH: +(
              (Math.exp(
                -(((db + hhMean + i * rate * 0.5 * strength) / 5) ** 2),
              ) *
                10 +
                0.4) *
              (1 + Math.sin(b * 2 + li) * 0.07)
            ).toFixed(2),
            HV: +(
              (Math.exp(-(((db + hvMean + i * rate * strength) / 4.7) ** 2)) *
                11 +
                0.3) *
              (1 + Math.sin(b * 2 + li) * 0.07)
            ).toFixed(2),
          };
        });
        for (const pol of ["HH", "HV"]) {
          const total = bins.reduce((s, b) => s + b[pol], 0);
          bins.forEach((b) => (b[pol] = +((b[pol] / total) * 100).toFixed(3)));
        }
        const profile = displacement
          ? Array.from({ length: 25 }, (_, k) => ({
              distanceKm: k,
              displacementCm: +(
                Math.tanh((k - 12) / 2.6) * i * 1.45 * strength +
                Math.sin(k * 0.65) * i * 0.13
              ).toFixed(2),
            }))
          : [];
        const median = (pol) => {
          let sum = 0;
          for (const bin of bins) {
            sum += bin[pol];
            if (sum >= 50) return bin.db;
          }
          return bins.at(-1).db;
        };
        return {
          date,
          referenceDate: dates[0],
          backscatterNormalization: "gamma0",
          histogramOrdinateUnit: "%",
          areaUnit: "km²",
          displacementSign: "positive_toward_sensor",
          productType: displacement ? "GUNW" : "GCOV",
          polarization: displacement ? ["HH"] : ["HH", "HV"],
          orbit: 4200 + pi * 180 + li * 50 + i * 175,
          frame: 60 + pi * 31 + li * 4,
          passDirection: li ? "DESCENDING" : "ASCENDING",
          productVersion: "ILLUSTRATIVE",
          histogramBinsDb: displacement ? [] : bins,
          displacementProfileCm: profile,
          metrics: displacement
            ? [
                {
                  id: "primary",
                  label: "Peak LOS displacement",
                  value: +Math.max(
                    ...profile.map((pt) => Math.abs(pt.displacementCm)),
                  ).toFixed(1),
                  unit: "cm",
                  area: areaKm2,
                  provenance: "sample",
                  status: i > 3 ? "ALERT" : "NOMINAL",
                },
                {
                  id: "area",
                  label: "Comparison footprint",
                  value: areaKm2,
                  unit: "km²",
                  area: areaKm2,
                  provenance: "sample",
                  status: "NOMINAL",
                },
                {
                  id: "signal",
                  label: "Coherence",
                  value: +(0.91 - i * 0.018 - li * 0.02).toFixed(2),
                  unit: "0–1",
                  area: areaKm2,
                  provenance: "sample",
                  status: "NOMINAL",
                },
              ]
            : [
                {
                  id: "primary",
                  label:
                    p.id === "wetland"
                      ? "Flagged wetland change"
                      : "Flagged canopy change",
                  value: +(
                    i * (p.id === "wetland" ? 2.4 : 3.7) * strength +
                    0.8
                  ).toFixed(1),
                  unit: "km²",
                  area: areaKm2,
                  provenance: "sample",
                  status: i > 3 ? "WARN" : "NOMINAL",
                },
                {
                  id: "area",
                  label: "Comparison footprint",
                  value: areaKm2,
                  unit: "km²",
                  area: areaKm2,
                  provenance: "sample",
                  status: "NOMINAL",
                },
                {
                  id: "signal",
                  label: "Median HV backscatter",
                  value: median("HV"),
                  unit: "dB",
                  area: areaKm2,
                  provenance: "sample",
                  status: i > 3 ? "WARN" : "NOMINAL",
                },
              ],
          insight: displacement
            ? "The illustrative profile separates across the corridor as the acquisition advances. Positive values indicate movement toward the satellite."
            : p.id === "wetland"
              ? "The illustrative HV distribution shifts toward lower backscatter. Amber patches mark sample changes in the wetland mosaic."
              : "The illustrative HV distribution shifts lower as sample canopy openings expand along the forest frontier.",
          layerUrls: { HH: null, HV: null, displacement: null },
          tileUrl: null,
        };
      }),
      events: [
        {
          date: dates[pi === 2 ? 4 : pi === 1 ? 2 : 3],
          label:
            p.id === "earthquake"
              ? "Sample displacement review"
              : "Sample change detected",
          status: "WARN",
        },
        {
          date: dates[6],
          label: "Sample review marker",
          status: p.id === "earthquake" ? "ALERT" : "WARN",
        },
      ],
    }),
  ),
}));
mkdirSync("data", { recursive: true });
writeFileSync(
  "data/sample-data.json",
  JSON.stringify(
    {
      schemaVersion: "1.0",
      provenance: "sample",
      nominalRepeatDays: 12,
      notes: [
        "All acquisitions, orbit/frame identifiers, events, metrics, and textures are fictional illustrations.",
        "Coordinates identify real geographic areas; samples make no claims about changes there.",
        "Earthquake analysis illustrates GUNW interferometry, not GCOV.",
      ],
      phenomena,
    },
    null,
    2,
  ) + "\n",
);
