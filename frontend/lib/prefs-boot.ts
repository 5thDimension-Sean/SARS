// Server-safe (no React import): the key and the pre-paint script used by the root layout.
export const PREFS_KEY = "dws-prefs";

/** Runs before first paint (inlined in <head>) so there is no flash of the wrong theme. Mirrors apply(). */
export const PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}");var t=p.theme==="auto"||p.theme==="light"?p.theme:"dark";var d=t==="auto"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var r=document.documentElement;r.dataset.theme=d;r.dataset.motion=p.motion==="reduced"?"reduced":"full"}catch(e){}})()`;
