"use client";

import {useEffect} from "react";

/** Progressive enhancement; content stays visible when JS is unavailable. */
export function MotionReveal() {
  useEffect(()=>{
    if(!("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes=Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const visible=new Set<HTMLElement>();
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries) {
        if(entry.isIntersecting) {
          const el=entry.target as HTMLElement;
          el.classList.add("is-revealed");
          visible.add(el);
          observer.unobserve(el);
        }
      }
    },{threshold:0.09,rootMargin:"0px 0px -40px 0px"});
    nodes.forEach(el=>{
      const rect=el.getBoundingClientRect();
      if(rect.top<window.innerHeight+50) {
        el.classList.add("is-revealed");
        visible.add(el);
      } else observer.observe(el);
    });
    document.documentElement.classList.add("precision-motion-ready");
    return ()=>{
      observer.disconnect();
      document.documentElement.classList.remove("precision-motion-ready");
      visible.clear();
    };
  },[]);
  return null;
}
