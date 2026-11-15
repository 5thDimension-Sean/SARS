"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SELECTOR = "main h1, main h2, main h3, main p, main li, main summary, main figure, main table, section > header, .sample-lab-heading, .sample-lab h2, footer > span";
/**
 * Fades text in as it scrolls into view, once. Elements are only hidden after this script has run (html.reveal-on),
 * so without JavaScript, or with reduced motion, everything is simply visible. Elements already on screen are not hidden.
 */
export function ScrollReveal() {
  const path = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.motion === "reduced") return;
    root.classList.add("reveal-on");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.shown = "1"; io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (seen.has(el) || el.closest("[data-reveal-skip]") || el.dataset.shown) return;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { el.dataset.shown = "1"; return; }
        el.dataset.rv = "1"; io.observe(el);
      });
    };
    scan();
    // Content that appears later (data loads, tabs) is picked up too.
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); root.classList.remove("reveal-on"); };
  }, [path]);
  return null;
}
