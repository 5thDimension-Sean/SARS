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

let polarization: Pol = "HH";
let studyChoice: StudyId | null = null; // set by in-app clicks; cleared when the URL changes (back/forward)

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onUrl = () => { studyChoice = null; emit(); };
  window.addEventListener("popstate", onUrl);
  window.addEventListener("hashchange", onUrl);
  return () => { listeners.delete(listener); window.removeEventListener("popstate", onUrl); window.removeEventListener("hashchange", onUrl); };
}

export function setPolarization(p: Pol) { if (p !== polarization) { polarization = p; emit(); } }
export function chooseStudy(id: StudyId) { if (id !== studyChoice) { studyChoice = id; emit(); } }

export const usePolarization = (): Pol => useSyncExternalStore(subscribe, () => polarization, () => "HH");
export const useStudyId = (): StudyId => useSyncExternalStore(subscribe, () => studyChoice ?? studyFromHash(window.location.hash), () => STUDIES[0].id);
