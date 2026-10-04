"use client";
import { useTween } from "@/hooks/use-tween";
export function TweenNumber({
  value,
  digits = 1,
  signed = false,
}: {
  value: number;
  digits?: number;
  signed?: boolean;
}) {
  const v = useTween(value) ?? value;
  return (
    <span data-value={value}>
      {signed && v > 0 ? "+" : ""}
      {v.toFixed(digits)}
    </span>
  );
}
