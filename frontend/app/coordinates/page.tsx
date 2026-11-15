"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { PLACES } from "@/lib/places";
import { SiteFooter } from "@/components/site-footer";
import styles from "@/components/investigation/investigation.module.css";

const ENDPOINT = (process.env.NEXT_PUBLIC_PROCESSING_API_URL ?? "").replace(/\/$/, "");
const ENABLED = /^https:\/\//.test(ENDPOINT) || (process.env.NODE_ENV === "development" && /^http:\/\/localhost(:\d+)?$/.test(ENDPOINT));
const STARTERS = [
  ...PLACES.map(p => ({ name: p.label, latitude: p.lat, longitude: p.lon })),
  { name: "Manaus, Amazon River · new search", latitude: -3.13, longitude: -60.02 },
].slice(0, 10);

type Pol = "HH" | "HV";
type Mode = "swipe" | "side" | "difference";
interface Observation { date: string; count: number; meanDb: number; medianDb: number; p05Db: number; p95Db: number }
interface Region { id: string; title: string; stats: Record<Pol, { pairedDifference: { pixels: number; medianDifferenceDb: number; meanDifferenceDb: number } }> }
interface Result {
  dates: [string, string]; track: string; frame: string; passDirection: string; release: string;
  coordinates: { latitude: number; longitude: number }; scientificStatus: string;
  disclaimer: string; catalogCount: number;
  images: Record<Pol, { before: string; after: string; difference: string }>;
  evidence: Record<Pol, { observations: [Observation, Observation]; differenceOfRegionalMeansDb: number; differenceOfRegionalMediansDb: number }>;
  regions: Region[];
  grid: { crs: string; shape: [number, number]; pixelSpacingMeters: [number, number]; pairedPixels: number };
}
type JobStatus = "idle" | "connecting" | "queued" | "searching" | "downloading" | "processing" | "ready" | "unavailable" | "failed";
const num = (n: number) => Number(n).toLocaleString("en-US");
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(3)} dB`;
const inputStyle: CSSProperties = { display: "block", width: "100%", marginTop: 8 };
const buttonStyle: CSSProperties = { padding: "12px 16px", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer" };

export default function CoordinateExplorer() {
  const [lat, setLat] = useState(String(STARTERS[0].latitude));
  const [lon, setLon] = useState(String(STARTERS[0].longitude));
  const keyRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<{ id: string; accessToken: string } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pol, setPol] = useState<Pol>("HH");
  const [mode, setMode] = useState<Mode>("swipe");
  const [split, setSplit] = useState(50);
  const [selected, setSelected] = useState("all");
  const [images, setImages] = useState<Record<string, string>>({});
  const valid = lat.trim() !== "" && lon.trim() !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) &&
    Math.abs(Number(lat)) <= 85 && Math.abs(Number(lon)) <= 180;
  const busy = ["connecting", "queued", "searching", "downloading", "processing"].includes(status);

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
    try {
      const response = await fetch(`${ENDPOINT}/v1/jobs`, {
        method: "POST", mode: "cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", "X-Earthdata-Token": key },
        body: JSON.stringify({ latitude: Number(lat), longitude: Number(lon) }),
      });
      const reply = await response.json();
      if (!response.ok || typeof reply.id !== "string" || typeof reply.accessToken !== "string")
        throw new Error(response.status === 429 ? "The worker is busy. Please try again shortly." :
          response.status === 403 ? "This website is not authorized to contact the processing worker." :
          "The processing request could not be started.");
      sessionRef.current = { id: reply.id, accessToken: reply.accessToken };
      setSessionId(reply.id); setStatus("queued"); setMessage("Looking for actual compatible NASA NISAR scenes.");
    } catch (error) {
      setStatus("failed"); setMessage(error instanceof Error ? error.message : "Unable to contact private processing service.");
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
          signal: controller.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("This private processing session expired or is unavailable.");
        const reply = await response.json();
        if (!active) return;
        setStatus(reply.status as JobStatus);
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
      const res = await fetch(`${ENDPOINT}/v1/jobs/${encodeURIComponent(session.id)}/image/${path.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }, credentials: "omit",
        cache: "no-store", signal: controller.signal, referrerPolicy: "no-referrer",
      });
      if (!res.ok) throw new Error("Measured image is unavailable");
      const blob = await res.blob();
      if (!blob.type.startsWith("image/png")) throw new Error("Unexpected output image format");
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
        <header><h1 style={{ fontSize: "clamp(2.2rem, 5vw, 4rem)", letterSpacing: "-.05em" }}>Investigate by coordinates.</h1>
          <p className={styles.lead}>Start anywhere on Earth. Select one of ten starting points or enter your own latitude and longitude. TANGO finds comparable real NISAR acquisitions automatically, then generates an Everglades-style radar investigation.</p></header>

        <h2 style={{ marginTop: 36, fontSize: "1.5rem" }}>Ten starting locations</h2>
        <p className={styles.muted}>These are coordinate shortcuts, not guarantees of satellite coverage. The backend checks NASA's actual catalog.</p>
        <div role="group" aria-label="Ten geographic starting locations" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          {STARTERS.map((place, i) => <button type="button" key={place.name} style={buttonStyle}
            disabled={busy} onClick={() => { setLat(String(place.latitude)); setLon(String(place.longitude)); setResult(null); setSessionId(""); setStatus("idle"); setMessage(""); }}>
            {i + 1}. {place.name}
          </button>)}
        </div>

        <form onSubmit={submit} style={{ marginTop: 30, display: "grid", gap: 18, maxWidth: 710 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            <label>Latitude <small>(−85 to 85)</small>
              <input className={styles.search} style={inputStyle} type="number" step="any" min="-85" max="85"
                autoComplete="off" required value={lat} disabled={busy} onChange={e => setLat(e.target.value)} />
            </label>
            <label>Longitude <small>(−180 to 180)</small>
              <input className={styles.search} style={inputStyle} type="number" step="any" min="-180" max="180"
                autoComplete="off" required value={lon} disabled={busy} onChange={e => setLon(e.target.value)} />
            </label>
          </div>
          <label>NASA Earthdata API token
            <input className={styles.search} style={inputStyle} type="password" ref={keyRef}
              autoComplete="off" spellCheck={false} placeholder="Paste your personal Earthdata token"
              disabled={!ENABLED || busy} aria-describedby="key-privacy" required />
          </label>
          <p className={styles.small} id="key-privacy">Your token is transmitted only when you select Generate, over HTTPS to the dedicated processing service. It is kept in worker memory for this job, never saved in local storage, repository files, or result URLs. Derived images are served through a separate short-lived access token. Use only an official Earthdata token you control.</p>
          <button className={styles.primary} type="submit" disabled={!ENABLED || !valid || busy} style={{ width: "fit-content", border: 0, cursor: ENABLED ? "pointer" : "not-allowed" }}>
            {busy ? "Processing real radar…" : "Generate my NISAR comparison"}
          </button>
          {!ENABLED && <p className={styles.notice} role="status">Live custom processing is not connected yet. Sean must deploy the dedicated private Python worker and configure NEXT_PUBLIC_PROCESSING_API_URL. No token can be submitted until it is securely connected.</p>}
          {!valid && <p className={styles.notice} role="alert">Enter valid latitude and longitude coordinates.</p>}
          {message && <p className={styles.notice} role="status" aria-live="polite">{message}</p>}
        </form>

        {result && status === "ready" && <section className={styles.section} aria-labelledby="custom-result">
          <header><h2 id="custom-result">Your real NASA NISAR investigation</h2>
            <p className={styles.lead}>Automatically selected acquisitions: {result.dates[0]} and {result.dates[1]}. HH/HV data are measured satellite returns, not simulated imagery.</p></header>
          <p className={styles.notice}>EXPLORATORY · NOT SCIENTIFICALLY CLEARED. {result.disclaimer} Product-level radiometric and noise QA and independent environmental interpretation are still necessary.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "20px 0" }}>
            <div role="group" aria-label="Polarization">{(["HH","HV"] as const).map(p =>
              <button type="button" key={p} aria-pressed={pol === p} style={buttonStyle} onClick={() => setPol(p)}>{p}</button>)}</div>
            <div role="group" aria-label="Map comparison mode">{(["swipe","side","difference"] as const).map(m =>
              <button type="button" key={m} aria-pressed={mode === m} style={buttonStyle} onClick={() => setMode(m)}>{m === "side" ? "Side by side" : m === "swipe" ? "Swipe" : "Difference"}</button>)}</div>
          </div>
          {before && after && diff ? <div>
            {mode === "side" ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
              <figure style={{ margin: 0 }}><figcaption>Before · {result.dates[0]} · {pol}</figcaption><img width="100%" src={before} alt="Real earlier NASA NISAR backscatter" /></figure>
              <figure style={{ margin: 0 }}><figcaption>After · {result.dates[1]} · {pol}</figcaption><img width="100%" src={after} alt="Real later NASA NISAR backscatter" /></figure>
            </div> : mode === "difference" ? <figure style={{ margin: 0, maxWidth: 950 }}>
              <figcaption>Later minus earlier · {pol} · blue decreases, red increases; clipped to ±6 dB.</figcaption>
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
          </div> : <p role="status">Retrieving measured, access-controlled raster previews…</p>}

          <h3 style={{ marginTop: 32 }}>Whole-scene radar measurements — {pol}</h3>
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

          <h3 style={{ marginTop: 32 }}>Data provenance & quality</h3>
          <p>NASA NISAR Level-2 provisional GCOV via ASF DAAC · {result.passDirection} track {result.track}, frame {result.frame}, release {result.release} · {result.grid.crs} · {num(result.grid.pairedPixels)} aligned analysis-grid pixels.</p>
          <p className={styles.small}>The two source files are processed privately and deleted after processing. This report contains no original HDF5 files, passwords, or API tokens. Results expire from the processing server.</p>
        </section>}
      </section>
      <SiteFooter />
    </div>
  </main>;
}
