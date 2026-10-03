"use client";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type ComponentRef,
} from "react";
import { Slider } from "@/components/ui/slider";
/** Adapt the catalog's root-only label to its generated accessible thumb. */
export function AccessibleSlider({
  label,
  valueText,
  ...props
}: ComponentProps<typeof Slider> & { label: string; valueText: string }) {
  const root = useRef<ComponentRef<typeof Slider>>(null);
  useEffect(() => {
    const thumb = root.current?.querySelector('[role="slider"]');
    thumb?.setAttribute("aria-label", label);
    thumb?.setAttribute("aria-valuetext", valueText);
  }, [label, valueText]);
  return <Slider {...props} ref={root} />;
}
