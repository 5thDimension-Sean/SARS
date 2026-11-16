/* eslint-disable @next/next/no-img-element -- private Blob URLs cannot use Next image optimization; preserve measured PNG pixels */
"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { PLACES } from "@/lib/places";
import { SiteFooter } from "@/components/site-footer";
import { COORDINATE_STARTERS as STARTERS, validCoordinate, processingEndpoint, isJobStatus, type JobStatus } from "@/lib/coordinate-request";
import styles from "@/components/investigation/investigation.module.css";

const ENDPOINT = processingEndpoint(process.env.NEXT_PUBLIC_PROCESSING_API_URL ?? "", process.env.NODE_ENV === "development");
const ENABLED = Boolean(ENDPOINT);

type Pol = "HH" | "HV";
type Mode = "swipe" | "side" | "difference";
interface Observation { date: string; granuleId: string; count: number; meanDb: number; medianDb: number; p05Db: number; p95Db: number }
interface Bin { lowDb: number; highDb: number; firstCount: number; secondCount: number }
interface Region { id: string; title: string; stats: Record<Pol, { pairedDifference: { pixels: number; medianDifferenceDb: number; meanDifferenceDb: number } }> }
interface Result {
  dates: [string, string]; track: string; frame: string; passDirection: string; release: string;
  coordinates: { latitude: number; longitude: number }; scientificStatus: string;
  disclaimer: string; catalogCount: number; quality: Record<string, string>; limitations: string[];
  images: Record<Pol, { before: string; after: string; difference: string }>;
  evidence: Record<Pol, { observations: [Observation, Observation]; bins: Bin[]; differenceOfRegionalMeansDb: number; differenceOfRegionalMediansDb: number }>;
  regions: Region[];
  grid: { crs: string; shape: [number, number]; pixelSpacingMeters: [number, number]; pairedPixels: number };
  productVersion: string; productSpecificationVersion: string;
}
const num = (n: number) => Number(n).toLocaleString("en-US");
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(3)} dB`;
const inputStyle: CSSProperties = { display: "block", width: "100%", marginTop: 8 };
const buttonStyle: CSSProperties = { padding: "12px 16px", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer" };

/** Exact, real radar-bin counts from the worker, never generated image guesses. */
function RadarHistogram({ bins, dates, pol }: { bins: Bin[]; dates: [string,string]; pol: Pol }) {
  const peak = Math.max(1, ...bins.flatMap(b => [b.firstCount, b.secondCount]));
  const plot = (key: "firstCount" | "secondCount") => bins.map((b, i) =>
    `${18 + i * 480 / Math.max(1, bins.length-1)},${118 - b[key] * 96 / peak}`).join(" ");
  return <div style={{ marginTop: 18, maxWidth: 750 }}>
    <svg viewBox="0 0 520 150" width="100%" role="img" aria-label={`Histogram of actual ${pol} backscatter: ${dates[0]} compared with ${dates[1]}, in fixed decibel bins`}>
      <line x1="18" y1="118" x2="498" y2="118" stroke="currentColor" opacity=".5" />
      <polyline points={plot("firstCount")} fill="none" stroke="#979da7" strokeWidth="2.3" />
      <polyline points={plot("secondCount")} fill="none" stroke="#4c98dc" strokeWidth="2.3" />
      <text x="18" y="140" fill="currentColor" fontSize="11">{bins[0]?.lowDb.toFixed(0)} dB</text>
      <text x="453" y="140" fill="currentColor" fontSize="11">{bins[bins.length-1]?.highDb.toFixed(0)} dB</text>
      <text x="18" y="14" fill="currentColor" fontSize="11">Pixels / dB bin</text>
    </svg>
    <p style={{ fontSize: 13 }}><span style={{ color: "#979da7" }}>?</span> {dates[0]} &nbsp; <span style={{ color: "#4c98dc" }}>?</span> {dates[1]}</p>
    <details style={{ marginTop: 12 }}><summary>Inspect original numerical histogram counts</summary>
      <div style={{ overflowX: "auto" }}><table className={styles.table}>
        <thead><tr><th>Backscatter range</th><th>{dates[0]}</th><th>{dates[1]}</th></tr></thead>
        <tbody>{bins.map(b => <tr key={b.lowDb}><td>{b.lowDb.toFixed(2)} - {b.highDb.toFixed(2)} dB</td>
          <td>{num(b.firstCount)}</td><td>{num(b.secondCount)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </div>;
}

export default function CoordinateExplorer() {
  const [lat, setLat] = useState(String(STARTERS[0].latitude));
  const [lon, setLon] = useState(String(STARTERS[0].longitude));
  const keyRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<{ id: string; accessToken: string } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pol, setPol] = useState<Pol>("HH");
  const [mode, setMode] = useState<Mode>("swipe");
  const [split, setSplit] = useState(50);
  const [selected, setSelected] = useState("all");
  const [images, setImages] = useState<Record<string, string>>({});
  const valid = validCoordinate(lat, lon);
  const busy = ["connecting", "queued", "searching", "downloading", "processing", "generating"].includes(status);
  const reset = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    sessionRef.current = null;
    setSessionId(""); setResult(null); setImages({}); setSelected("all"); setSplit(50);
    setStatus("idle"); setMessage("");
  };
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; sessionRef.current = null; }, []);
  const matchingPublished = valid ? PLACES.filter(p => p.bounds &&
    Number(lon) >= p.bounds[0] && Number(lon) <= p.bounds[2] &&
    Number(lat) >= p.bounds[1] && Number(lat) <= p.bounds[3]) : [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ENABLED || !valid || busy) return;
    // Uncontrolled password field: never copy credentials into React state,
    // query strings, localStorage, sessionStorage, analytics or console.
    const key = keyRef.current?.value.trim() ?? "";
    if (keyRef.current) keyRef.current.value = "";
    if (!key) { setMessage("Enter your NASA Earthdata token to authenticate this one processing request."); return; }
    sessionRef.current = null;
    setSessionId(""); setResult(null); setImages({}); setStatus("connecting");
    setMessage("Connecting to the private processing worker over HTTPS.");
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${ENDPOINT}/v1/jobs`, {
        method: "POST", mode: "cors", cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Earthdata-Token": key },
        body: JSON.stringify({ latitude: Number(lat), longitude: Number(lon) }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "The worker has reached its processing limit. Please try again later." : "Unable to start processing. Check your token and try again.");
      const reply = (await response.json()) as Record<string, unknown>;
      if (controller.signal.aborted) return;
      if (!response.ok || typeof reply.id !== "string" || typeof reply.accessToken !== "string")
        throw new Error(response.status === 429 ? "The worker is busy. Please try again shortly." :
          response.status === 403 ? "This website is not authorized to contact the processing worker." :
          "The processing request could not be started.");
      sessionRef.current = { id: reply.id as string, accessToken: reply.accessToken as string };
      setSessionId(reply.id as string); setStatus("queued"); setMessage("Looking for actual compatible NASA NISAR scenes.");
    } catch (error) {
      if (requestRef.current !== controller) return;
      setStatus("failed"); setMessage(error instanceof Error ? error.message : "Unable to contact private processing service.");
    } finally {
      clearTimeout(timeout);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    let active = true, handle: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      const session = sessionRef.current;
      if (!active || !session || session.id !== sessionId) return;
      try {
        const response = await fetch(`${ENDPOINT}/v1/jobs/${encodeURIComponent(session.id)}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("This private processing session expired or is unavailable.");
        const reply = (await response.json()) as Record<string, unknown>;
        if (!active) return;
        if (!isJobStatus(reply.status)) throw new Error("Unexpected processing status");
        if (reply.status === "ready" && !reply.result) throw new Error("Missing processing result");
        setStatus(reply.status);
        setMessage(String(reply.progress || ""));
        if (reply.status === "ready" && reply.result) { setResult(reply.result as Result); return; }
        if (reply.status === "failed" || reply.status === "unavailable") return;
        handle = setTimeout(poll, 3000);
      } catch {
        if (active) { setStatus("failed"); setMessage("Connection to the private processing session was lost."); }
      }
    };
    void poll();
    return () => { active = false; clearTimeout(handle); controller.abort(); };
  }, [sessionId]);

  // Derived PNGs are fetched with the opaque job access token, turned into local
  // object URLs, and revoked. Earthdata credentials never enter image URLs.
  useEffect(() => {
    if (!result || !sessionId) return;
    let alive = true;
    const controller = new AbortController();
    const created: string[] = [];
    const session = sessionRef.current;
    if (!session || session.id !== sessionId) return;
    const items = Object.entries(result.images).flatMap(([p, a]) => Object.entries(a).map(([mode, path]) => ({
      name: `${p}:${mode}`, path,
    })));
    void Promise.all(items.map(async ({ name, path }) => {
      if (!/^(custom-preview|custom-regions)\/[A-Za-z0-9_-]+\.png$/.test(path)) throw new Error("Unexpected image path");
      const res = await fetch(`${ENDPOINT}/v1/jobs/${encodeURIComponent(session.id)}/image/${path.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }, credentials: "omit", redirect: "error",
        cache: "no-store", signal: controller.signal, referrerPolicy: "no-referrer",
      });
      if (!res.ok) throw new Error("Measured image is unavailable");
      const blob = await res.blob();
      if (!blob.type.startsWith("image/png")) throw new Error("Unexpected output image format");
      if (!alive) return;
      const objectUrl = URL.createObjectURL(blob); created.push(objectUrl);
      if (alive) setImages(previous => ({ ...previous, [name]: objectUrl }));
    })).catch(() => { if (alive) setMessage("Some verified image previews could not be loaded."); });
    return () => { alive = false; controller.abort(); created.forEach(URL.revokeObjectURL); };
  }, [result, sessionId]);

  const before = images[`${pol}:before`], after = images[`${pol}:after`], diff = images[`${pol}:difference`];
  const region = useMemo(() => result?.regions.find(r => r.id === selected), [result, selected]);

  return <main className={styles.page}>
    <div className={styles.wrap}>
      <section className={styles.section} style={{ paddingTop: "clamp(40px, 8vw, 96px)" }}>
        <header><h1 style={{ fontSize: "clamp(2.5rem, 6.4vw, 5.25rem)", fontWeight: 600, letterSpacing: "-.055em", lineHeight: 1 }}>Investigate by coordinates.</h1>
          <p className={styles.lead}>Pick a starting point or enter a latitude and longitude.</p></header>

        <h2 style={{ marginTop: 36, fontSize: "1.5rem" }}>Ten starting locations</h2>
        <p className={styles.muted}>Shortcuts only; coverage is checked against the NASA catalog.</p>
        <div role="group" aria-label="Ten geographic starting locations" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          {STARTERS.map((place, i) => <button type="button" key={place.name} style={buttonStyle}
            disabled={busy} onClick={() => { reset(); setLat(String(place.latitude)); setLon(String(place.longitude)); }}>
            {i + 1}. {place.name}
          </button>)}
        </div>

        <form onSubmit={submit} style={{ marginTop: 30, display: "grid", gap: 18, maxWidth: 710 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            <label>Latitude <small>(-85 to 85)</small>
              <input className={styles.search} style={inputStyle} type="number" step="any" min="-85" max="85"
                autoComplete="off" required value={lat} disabled={busy} onChange={e => { reset(); setLat(e.target.value); }} />
            </label>
            <label>Longitude <small>(-180 to 180)</small>
              <input className={styles.search} style={inputStyle} type="number" step="any" min="-180" max="180"
                autoComplete="off" required value={lon} disabled={busy} onChange={e => { reset(); setLon(e.target.value); }} />
            </label>
          </div>
          <label>NASA Earthdata API token
            <input className={styles.search} style={inputStyle} type="password" ref={keyRef}
              autoComplete="off" spellCheck={false} placeholder="Paste your personal Earthdata token"
              disabled={!ENABLED || busy} aria-describedby="key-privacy" required />
          </label>
          <p className={styles.small} id="key-privacy">Your token is transmitted only when you select Generate, over HTTPS to the dedicated processing service. It is kept in worker memory for this job, never saved in local storage, repository files, or result URLs. Derived images are served through a separate short-lived access token. Use only an official Earthdata token you control.</p>
          <button className={styles.primary} type="submit" disabled={!ENABLED || !valid || busy} style={{ width: "fit-content", border: 0, cursor: ENABLED ? "pointer" : "not-allowed" }}>
            {busy ? "Processing real radar." : "Generate my NISAR comparison"}
          </button>
          {!ENABLED && <p className={styles.notice} role="status">Custom processing is currently unavailable. You can explore the published radar investigations below.</p>}
          {!valid && <p className={styles.notice} role="alert">Enter latitude from -85 to 85 and longitude from -180 to 180. The small study area must not cross the date line.</p>}
          {message && <p className={styles.notice} role="status" aria-live="polite">{message}</p>}
        </form>
        {matchingPublished.length > 0 && <div className={styles.notice} style={{ marginTop: 22 }}>
          <strong>Already-published NASA comparison at this coordinate</strong>
          {matchingPublished.map(place => <p key={place.id}><Link href={place.href}>Explore {place.label} using published NISAR files</Link></p>)}
        </div>}

        {result && status === "ready" && <section className={styles.section} aria-labelledby="custom-result">
          <header><h2 id="custom-result">Your real NASA NISAR investigation</h2>
            <p>Requested point: {result.coordinates.latitude.toFixed(5)}�, {result.coordinates.longitude.toFixed(5)}� (latitude, longitude).</p>
            <p className={styles.lead}>Automatically selected acquisitions: {result.dates[0]} and {result.dates[1]}. HH/HV data are measured satellite returns, not simulated imagery.</p></header>
          <p className={styles.notice}>EXPLORATORY � NOT SCIENTIFICALLY CLEARED. {result.disclaimer} Product-level radiometric and noise QA and independent environmental interpretation are still necessary.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "20px 0" }}>
            <div role="group" aria-label="Polarization">{(["HH","HV"] as const).map(p =>
              <button type="button" key={p} aria-pressed={pol === p} style={buttonStyle} onClick={() => setPol(p)}>{p}</button>)}</div>
            <div role="group" aria-label="Map comparison mode">{(["swipe","side","difference"] as const).map(m =>
              <button type="button" key={m} aria-pressed={mode === m} style={buttonStyle} onClick={() => setMode(m)}>{m === "side" ? "Side by side" : m === "swipe" ? "Swipe" : "Difference"}</button>)}</div>
          </div>
          {before && after && diff ? <div>
            {mode === "side" ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
              <figure style={{ margin: 0 }}><figcaption>Before � {result.dates[0]} � {pol}</figcaption><img width="100%" src={before} alt="Real earlier NASA NISAR backscatter" /></figure>
              <figure style={{ margin: 0 }}><figcaption>After � {result.dates[1]} � {pol}</figcaption><img width="100%" src={after} alt="Real later NASA NISAR backscatter" /></figure>
            </div> : mode === "difference" ? <figure style={{ margin: 0, maxWidth: 950 }}>
              <figcaption>Later minus earlier � {pol} � blue decreases, red increases; clipped to �6 dB.</figcaption>
              <img src={diff} alt="Derived georeferenced NISAR backscatter difference" width="100%" />
            </figure> : <div style={{ maxWidth: 950 }}>
              <div style={{ position: "relative", overflow: "hidden" }}>
                <img src={before} alt={`Before acquisition ${result.dates[0]}`} width="100%" style={{ display: "block" }} />
                <img src={after} alt={`After acquisition ${result.dates[1]}`} width="100%" style={{ position: "absolute", inset: 0, height: "100%", objectFit: "fill", clipPath: `inset(0 ${100-split}% 0 0)` }} />
                <span style={{ position: "absolute", top: 0, bottom: 0, left: `${split}%`, width: 2, background: "white", pointerEvents: "none" }} aria-hidden="true" />
              </div>
              <label>Before / after divider: {split}%
                <input style={{ display: "block", width: "100%" }} type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} />
              </label>
            </div>}
          </div> : <p role="status">Retrieving measured, access-controlled raster previews.</p>}

          <h3 style={{ marginTop: 32 }}>Whole-scene radar measurements - {pol}</h3>
          <RadarHistogram bins={result.evidence[pol].bins} dates={result.dates} pol={pol} />
          <div style={{ overflowX: "auto" }}><table className={styles.table}>
            <thead><tr><th>Statistic</th><th>{result.dates[0]}</th><th>{result.dates[1]}</th></tr></thead>
            <tbody>{([
              ["Median dB", "medianDb"], ["Mean dB", "meanDb"], ["5th percentile dB", "p05Db"],
              ["95th percentile dB", "p95Db"], ["Valid analysis-grid pixels", "count"],
            ] as const).map(([label, key]) =>
              <tr key={key}><th>{label}</th>{result.evidence[pol].observations.map((o,i) =>
                <td key={i}>{key === "count" ? num(o[key]) : o[key].toFixed(3)}</td>)}</tr>)}
            </tbody>
          </table></div>
          <p className={styles.small}>Whole-scene difference of medians: {signed(result.evidence[pol].differenceOfRegionalMediansDb)}; this is not a paired per-pixel difference.</p>

          <h3 style={{ marginTop: 32 }}>Inspect exploratory regions A, B, C</h3>
          <div role="group" aria-label="Region selection" style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
            <button type="button" style={buttonStyle} aria-pressed={selected === "all"} onClick={() => setSelected("all")}>All</button>
            {result.regions.map(r => <button type="button" key={r.id} style={buttonStyle} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>Region {r.id}</button>)}
          </div>
          {region ? <p>Region {region.id}: {region.title}. Paired {pol} pixels: {num(region.stats[pol].pairedDifference.pixels)}. Median per-pixel change: {signed(region.stats[pol].pairedDifference.medianDifferenceDb)}. Candidate regions were selected for contrasting radar responses and are not a representative sample.</p>
            : <p>Three automatically selected regions illustrate differences in radar return. They are not mapped environmental damage, flood zones, or shoreline erosion.</p>}

          <h3 style={{ marginTop: 32 }}>Scientific quality checks</h3>
          <div style={{ overflowX: "auto" }}><table className={styles.table}>
            <thead><tr><th>Check</th><th>Status and reason</th></tr></thead>
            <tbody>{Object.entries(result.quality).map(([check, detail]) =>
              <tr key={check}><th>{check}</th><td>{detail}</td></tr>)}</tbody>
          </table></div>
          <h3 style={{ marginTop: 24 }}>Known limitations</h3>
          <ul>{result.limitations.map((limitation, i) => <li key={i}>{limitation}</li>)}</ul>
          <h3 style={{ marginTop: 32 }}>Data provenance & quality</h3>
          <p>NASA NISAR Level-2 provisional GCOV via ASF DAAC � {result.passDirection} track {result.track}, frame {result.frame}, release {result.release} � {result.grid.crs} � {num(result.grid.pairedPixels)} aligned analysis-grid pixels.</p>
          <p>Product version {result.productVersion}; specification {result.productSpecificationVersion}. Source granules: {result.evidence.HH.observations.map(o => o.granuleId).join("; ")}.</p>
          <p className={styles.small}>The two source files are processed privately and deleted after processing. This report contains no original HDF5 files, passwords, or API tokens. Results expire from the processing server.</p>
        </section>}
      </section>
      <SiteFooter />
    </div>
  </main>;
}

