// Display preferences: appearance, color mode and motion. First-party only (localStorage), never sent anywhere.
import { useSyncExternalStore } from "react";
import { PREFS_KEY } from "./prefs-boot.ts";

export type ThemePref = "auto" | "light" | "dark";
export type ColorPref = "color" | "bw";
export type MotionPref = "full" | "reduced";
export interface Prefs { theme: ThemePref; color: ColorPref; motion: MotionPref }

/** Dark is the designed default; "auto" follows the operating system when chosen. */
export const DEFAULT_PREFS: Prefs = { theme: "dark", color: "color", motion: "full" };
export { PREFS_KEY };

/** Whitelists every field so malformed or hostile stored values can never reach the DOM. */
export function sanitizePrefs(raw: unknown): Prefs {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    theme: r.theme === "auto" || r.theme === "light" || r.theme === "dark" ? r.theme : DEFAULT_PREFS.theme,
    color: r.color === "bw" ? "bw" : "color",
    motion: r.motion === "reduced" ? "reduced" : "full",
  };
}
export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "auto" ? (systemDark ? "dark" : "light") : pref;
}

const listeners = new Set<() => void>();
let current: Prefs | null = null;
const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(p: Prefs) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(p.theme, systemDark());
  root.dataset.bw = String(p.color === "bw");
  root.dataset.motion = p.motion;
}
function load(): Prefs {
  try { return sanitizePrefs(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")); } catch { return DEFAULT_PREFS; }
}
const snapshot = () => (current ??= load());

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => { apply(snapshot()); listener(); };
  const onStorage = (e: StorageEvent) => { if (e.key === PREFS_KEY) { current = load(); apply(current); listener(); } };
  media.addEventListener("change", onSystem); window.addEventListener("storage", onStorage);
  apply(snapshot());
  return () => { listeners.delete(listener); media.removeEventListener("change", onSystem); window.removeEventListener("storage", onStorage); };
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  const next = sanitizePrefs({ ...snapshot(), [key]: value });
  current = next; apply(next);
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode: preference lasts for this visit only */ }
  listeners.forEach((l) => l());
}

export const usePrefs = (): Prefs => useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS);

/** True when the system or the in-app setting asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced");
}
