// Tiny shared view state so the site-wide navigation bar and the investigation page agree
// on the selected location and polarization without prop drilling or extra dependencies.
import { useSyncExternalStore } from "react";
import { STUDIES, type Pol, type StudyConfig } from "./investigation.ts";

type StudyId = StudyConfig["id"];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Parses "#california" style fragments; anything unknown falls back to the first study. */
export function studyFromHash(hash: string): StudyId {
  const id = hash.replace(/^#/, "");
  return STUDIES.find((s) => s.id === id)?.id ?? STUDIES[0].id;
}

/** The URL is the source of truth. A remembered in-app click only applies while the URL agrees with it or names no place,
 *  so following a link to another place can never be overridden by an earlier click. */
export function resolveStudy(choice: StudyId | null, hash: string): StudyId {
  const id = hash.replace(/^#/, "");
  const fromUrl = STUDIES.find((s) => s.id === id)?.id ?? null;
  if (choice && (fromUrl === null || fromUrl === choice)) return choice;
  return fromUrl ?? STUDIES[0].id;
}

let polarization: Pol = "HH";
let studyChoice: StudyId | null = null; // set by in-app clicks; cleared when the URL changes (back/forward)

// Next's client-side links change the URL with history.pushState, which fires no event. Watch it so the
// selected place always follows the address, however the visitor got there.
let restoreHistory: (() => void) | null = null;
function watchHistory() {
  if (restoreHistory) return;
  const push = history.pushState, replace = history.replaceState;
  const changed = () => queueMicrotask(() => { studyChoice = null; emit(); });
  history.pushState = function (...args) { const r = push.apply(this, args); changed(); return r; };
  history.replaceState = function (...args) { const r = replace.apply(this, args); changed(); return r; };
  restoreHistory = () => { history.pushState = push; history.replaceState = replace; restoreHistory = null; };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  watchHistory();
  const onUrl = () => { studyChoice = null; emit(); };
  window.addEventListener("popstate", onUrl);
  window.addEventListener("hashchange", onUrl);
  return () => {
    listeners.delete(listener); window.removeEventListener("popstate", onUrl); window.removeEventListener("hashchange", onUrl);
    if (listeners.size === 0) restoreHistory?.();
  };
}

export function setPolarization(p: Pol) { if (p !== polarization) { polarization = p; emit(); } }
export function chooseStudy(id: StudyId) { if (id !== studyChoice) { studyChoice = id; emit(); } }

export const usePolarization = (): Pol => useSyncExternalStore(subscribe, () => polarization, () => "HH");
export const useStudyId = (): StudyId => useSyncExternalStore(subscribe, () => resolveStudy(studyChoice, window.location.hash), () => STUDIES[0].id);
