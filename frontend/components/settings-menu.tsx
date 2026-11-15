"use client";

import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { Monitor, Moon, Settings, Sparkles, Sun, ZapOff } from "lucide-react";
import { setPref, usePrefs, type Prefs } from "@/lib/prefs";
import styles from "./site-nav.module.css";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
interface Group<K extends keyof Prefs> { key: K; title: string; options: { value: Prefs[K]; label: string; Icon: Icon }[] }

const GROUPS: [Group<"theme">, Group<"motion">] = [
  { key: "theme", title: "Appearance", options: [{ value: "auto", label: "Auto", Icon: Monitor }, { value: "light", label: "Light", Icon: Sun }, { value: "dark", label: "Dark", Icon: Moon }] },
  { key: "motion", title: "Motion", options: [{ value: "full", label: "Full", Icon: Sparkles }, { value: "reduced", label: "Reduced", Icon: ZapOff }] },
];

/** Display settings: a small popover of icon tiles. Preferences are stored on this device only. */
export function SettingsMenu() {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [open]);

  return <div ref={root} className={styles.settings}>
    <button ref={button} type="button" className={styles.gear} aria-label="Display settings" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
      <Settings size={17} strokeWidth={1.75} aria-hidden />
    </button>
    <div id={id} role="dialog" aria-label="Display settings" className={styles.panel} data-open={open} inert={!open}>
      {GROUPS.map((g) => <div key={g.key} role="group" aria-label={g.title} className={styles.group}>
        <span className={styles.groupTitle}>{g.title}</span>
        <div className={styles.tiles} style={{ gridTemplateColumns: `repeat(${g.options.length}, 1fr)` }}>
          {(g.options as { value: string; label: string; Icon: Icon }[]).map(({ value, label, Icon }) =>
            <button key={value} type="button" className={styles.tile} aria-pressed={prefs[g.key] === value} onClick={() => setPref(g.key, value as never)}>
              <Icon size={20} strokeWidth={1.6} aria-hidden /><span>{label}</span>
            </button>)}
        </div>
      </div>)}
      <p className={styles.fine}>Saved on this device only.</p>
    </div>
  </div>;
}
