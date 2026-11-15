/* eslint-disable @next/next/no-img-element -- user-chosen blob URLs and static measured rasters are shown exactly as supplied */
"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from "react";
import { blendChanges } from "@/lib/change-filter";
import { acceptableFile, analyzePair, differenceRgba, toGray, type Gray } from "@/lib/upload-analysis";
import { SiteFooter } from "./site-footer";
import inv from "./investigation/investigation.module.css";
import styles from "./native-study.module.css";

const MAX_SIDE = 1400;
interface Loaded { gray: Gray; url: string; name: string }

/** Decodes an image on this device, downscaled so the longest side is at most MAX_SIDE. Nothing is sent anywhere. */
async function decode(file: File): Promise<Loaded> {
  const bitmap = await createImageBitmap(file);
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { gray: toGray(ctx.getImageData(0, 0, w, h).data, w, h), url: URL.createObjectURL(file), name: file.name };
  } finally { bitmap.close(); }
}

export function UploadCompare() {
  const [before, setBefore] = useState<Loaded | null>(null);
  const [after, setAfter] = useState<Loaded | null>(null);
  const [errors, setErrors] = useState<{ before?: string; after?: string }>({});
  const [strength, setStrength] = useState(0.6);
  const [split, setSplit] = useState(50);
  const [show, setShow] = useState(true);
  const [overlay, setOverlay] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const analysis = useMemo(() => analyzePair(before?.gray ?? null, after?.gray ?? null), [before, after]);

  useEffect(() => {
    if (!analysis.usable || !before || !after) return;
    const { width, height } = before.gray;
    const { data } = blendChanges(differenceRgba(before.gray, after.gray), width, height, { threshold: strength, radius: Math.max(2, Math.round(Math.max(width, height) / 300)) });
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    canvas.getContext("2d")!.putImageData(new ImageData(data, width, height), 0, 0);
    let made = "", live = true;
    canvas.toBlob((b) => { if (b && live) { made = URL.createObjectURL(b); setOverlay(made); } });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [analysis.usable, before, after, strength]);

  const pick = (which: "before" | "after") => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const problem = acceptableFile(file);
    setErrors((p) => ({ ...p, [which]: problem ?? undefined }));
    if (problem) return;
    try {
      const loaded = await decode(file);
      urls.current.push(loaded.url);
      (which === "before" ? setBefore : setAfter)(loaded);
    } catch { setErrors((p) => ({ ...p, [which]: "That image could not be read." })); }
  };
  const move = (x: number) => { const b = frame.current?.getBoundingClientRect(); if (b?.width) setSplit(Math.min(100, Math.max(0, ((x - b.left) / b.width) * 100))); };
  const down = (e: PointerEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); };
  const drag = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX); };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setSplit((v) => Math.max(0, v - step)); else if (e.key === "ArrowRight") setSplit((v) => Math.min(100, v + step)); else return;
    e.preventDefault();
  };
  const s = analysis.stats;
  const field = (which: "before" | "after", label: string) => <label className={styles.stat} style={{ display: "grid", gap: 8, cursor: "pointer" }}>
    <span style={{ fontWeight: 700 }}>{label}</span>
    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick(which)} aria-describedby={`up-${which}-note`} />
    <span id={`up-${which}-note`} className={styles.note} style={{ margin: 0 }}>{errors[which] ? <strong role="alert">{errors[which]}</strong> : (which === "before" ? before : after)?.name ?? "PNG, JPEG or WebP, up to 25 MB"}</span>
  </label>;

  return <main className={inv.page}>
    <div className={inv.wrap}>
      <section className={styles.root} aria-labelledby="up-title">
        <h1 id="up-title" style={{ margin: "0 0 12px", fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 700, letterSpacing: "-.05em", lineHeight: 1 }}>Upload your own</h1>
        <p className={styles.lead}>Pick a before and an after image. Tango runs automatic checks first, then shows where brightness changed. Everything happens in your browser; your files are never uploaded.</p>
        <p className={inv.notice} role="note" style={{ marginTop: 16 }}>Your images are not NASA data and are not calibrated radar. This page compares picture brightness only. It cannot read raw NISAR HDF5 products (those are processed offline) and it names no cause.</p>
        <div className={styles.stats} style={{ marginBottom: 12 }}>{field("before", "Before image")}{field("after", "After image")}</div>

        <section aria-labelledby="up-checks" className={styles.trust} style={{ borderTop: 0, paddingTop: 0 }}>
          <h2 id="up-checks" style={{ fontSize: "1.5rem", margin: "0 0 12px" }}>Automatic checks</h2>
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {analysis.checks.map((c) => <li key={c.id} className={styles.stat} style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "baseline" }}>
              <span aria-label={c.status} style={{ minWidth: 52, fontWeight: 800, fontSize: ".75rem", letterSpacing: ".06em", color: c.status === "pass" ? "#4cc38a" : c.status === "warn" ? "#e9b44c" : c.status === "pending" ? "#a1a1a6" : "#ff6b6b" }}>{c.status === "pending" ? "WAITING" : c.status.toUpperCase()}</span>
              <span><b style={{ fontSize: "1rem", letterSpacing: 0 }}>{c.label}.</b> <span style={{ color: "var(--label2)" }}>{c.detail}</span></span></li>)}
          </ul>
        </section>

        {analysis.usable && before && after && <>
          <div className={styles.tools}>
            <label className={styles.check}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show changes</label>
            <label className={styles.check}>Faint<input type="range" min={0.3} max={0.9} step={0.05} value={strength} aria-label="Hide differences weaker than this strength" onChange={(e) => setStrength(Number(e.target.value))} />Strong</label>
          </div>
          <div className={styles.panel}>
            <div ref={frame} className={styles.frame} style={{ aspectRatio: `${before.gray.width} / ${before.gray.height}` }}>
              <img src={before.url} alt="Your before image" />
              <div className={styles.layer} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                <img src={after.url} alt="Your after image" />
                {show && overlay && <img className={styles.overlay} src={overlay} alt="" aria-hidden="true" />}
              </div>
              <div className={styles.divider} style={{ left: `${split}%` }} role="slider" tabIndex={0} aria-label="Before and after divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)}
                onPointerDown={down} onPointerMove={drag} onKeyDown={key}><span aria-hidden="true">↔</span></div>
              <span className={`${styles.tag} ${styles.tagL}`}>{show ? "After + changes" : "After"}</span><span className={`${styles.tag} ${styles.tagR}`}>Before</span>
            </div>
            <div className={styles.legend}><span><i style={{ background: "#e03a2e" }} />Later image brighter</span><span><i style={{ background: "#2f8bff" }} />Later image darker</span><span>Unchanged areas are left uncolored</span></div>
          </div>
        </>}

        <section aria-labelledby="up-overview" className={styles.trust} style={{ marginTop: 28 }}>
          <h2 id="up-overview" style={{ fontSize: "1.5rem", margin: "0 0 12px" }}>Overview <span className={styles.note} style={{ fontWeight: 400 }}>· rule-based, not AI</span></h2>
          {analysis.overview.map((l) => <p key={l}>{l}</p>)}
          {s && <div className={styles.stats}>
            {[["Compared pixels", s.validPixels.toLocaleString("en-US")], ["Changed pixels", `${(s.changedFraction * 100).toFixed(1)}%`], ["Average brightness shift", `${s.meanShift >= 0 ? "+" : "−"}${Math.abs(s.meanShift).toFixed(1)} / 255`]].map(([n, v]) =>
              <div className={styles.stat} key={n}><div>{n}</div><strong>{v}</strong></div>)}
          </div>}
        </section>
      </section>
      <SiteFooter />
    </div>
  </main>;
}
