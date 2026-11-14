"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { POLS, STUDIES } from "@/lib/investigation";
import { SettingsMenu } from "./settings-menu";
import { chooseStudy, setPolarization, usePolarization, useStudyId } from "@/lib/view-store";
import styles from "./site-nav.module.css";

const ITEMS = [
  { key: "home", label: "Home", href: "/" },
  ...STUDIES.map((s) => ({ key: s.id, label: s.short, href: `/nisar-prototype#${s.id}` })),
] as const;

/**
 * Global navigation. Lives in the root layout, so it persists across route changes and the active
 * highlight glides between items instead of re-rendering. Only transform/opacity are animated.
 */
export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const study = useStudyId();
  const pol = usePolarization();
  const onInvestigation = pathname.startsWith("/nisar-prototype");
  const activeKey = onInvestigation ? study : pathname === "/" ? "home" : "";
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  const place = useCallback((target: Element | null, el: HTMLElement | null) => {
    if (!target || !el) return;
    const t = target as HTMLElement;
    el.style.width = `${t.offsetWidth}px`;
    el.style.transform = `translateX(${t.offsetLeft}px)`;
  }, []);
  const active = () => list.current?.querySelector(`[data-key="${activeKey}"]`) ?? null;

  useEffect(() => {
    const p = pill.current;
    if (!p) return;
    const target = active();
    if (!target) { p.style.opacity = "0"; return; }
    // The first placement must not animate in from x = 0.
    if (!placed.current) { p.style.transition = "none"; place(target, p); void p.offsetWidth; p.style.transition = ""; placed.current = true; }
    else place(target, p);
    p.style.opacity = "1";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- active() reads the current activeKey
  }, [activeKey, place]);

  useEffect(() => {
    const l = list.current;
    if (!l) return;
    const ro = new ResizeObserver(() => { place(active(), pill.current); });
    ro.observe(l);
    const onScroll = () => { if (bar.current) bar.current.dataset.scrolled = String(window.scrollY > 4); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener("scroll", onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- active() reads the current activeKey
  }, [place, activeKey]);

  const hover = (el: Element | null) => { if (ghost.current && el) { place(el, ghost.current); ghost.current.style.opacity = "1"; } };
  const unhover = () => { if (ghost.current) ghost.current.style.opacity = "0"; };

  return <header ref={bar} className={styles.bar} data-scrolled="false">
    <nav className={styles.inner} aria-label="Primary">
      <Link href="/" className={styles.brand}>Dancing with SARs</Link>
      <div ref={list} className={styles.list} onPointerLeave={unhover} onBlur={unhover}>
        <span ref={ghost} className={styles.ghost} aria-hidden="true" />
        <span ref={pill} className={styles.pill} aria-hidden="true" />
        <ul>
          {ITEMS.map((item) => <li key={item.key}>
            <Link href={item.href} data-key={item.key} className={styles.link} aria-current={activeKey === item.key ? "page" : undefined}
              onPointerEnter={(e) => hover(e.currentTarget)} onFocus={(e) => hover(e.currentTarget)}
              onClick={() => { if (item.key !== "home") chooseStudy(item.key as (typeof STUDIES)[number]["id"]); }}>{item.label}</Link>
          </li>)}
        </ul>
      </div>
      <div className={styles.right}>
        {onInvestigation && <div className={styles.pol} role="group" aria-label="Polarization">
          {POLS.map((p) => <button key={p} type="button" aria-pressed={pol === p} onClick={() => setPolarization(p)}>{p}</button>)}
        </div>}
        <SettingsMenu />
      </div>
    </nav>
  </header>;
}
