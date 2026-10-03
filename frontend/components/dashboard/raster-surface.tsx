"use client";
import { useEffect, useRef, useState } from "react";
import type { GeographicBounds } from "@/lib/sample-schema";
import { formatCoordinates } from "@/lib/dashboard-utils";

/** Render an already reprojected static overlay in its Web Mercator extent. */
export function RasterSurface({
  url,
  changeUrl,
  bounds,
  boundaries,
  label,
}: {
  url: string | null;
  changeUrl?: string;
  bounds: GeographicBounds;
  boundaries: boolean;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setFailed(null), [url, changeUrl]);
  const mercatorY = (latitude: number) =>
    Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  const ratio =
    ((bounds[2] - bounds[0]) * Math.PI) /
    180 /
    (mercatorY(bounds[3]) - mercatorY(bounds[1]));
  const width = Math.min(size.width, size.height * ratio),
    height = width / ratio;
  return (
    <div className="raster-surface" ref={root}>
      <div
        className={`raster-frame ${boundaries ? "show-raster-boundary" : ""}`}
        style={{ width, height }}
      >
        {url && (
          <img
            src={url}
            alt={label}
            className="gcov-raster"
            onError={() => setFailed("Backscatter asset unavailable")}
          />
        )}
        {changeUrl && (
          <img
            src={changeUrl}
            alt="Later minus earlier backscatter change in dB"
            className="gcov-raster raster-change"
            onError={() => setFailed("Change asset unavailable")}
          />
        )}
        {boundaries && (
          <>
            <span className="raster-corner northwest">
              {formatCoordinates(bounds[3], bounds[0])}
            </span>
            <span className="raster-corner southeast">
              {formatCoordinates(bounds[1], bounds[2])}
            </span>
          </>
        )}
      </div>
      {(!url || failed) && (
        <div className="raster-unavailable" role="status">
          WARN · {failed ?? "Polarization unavailable for this acquisition"}
        </div>
      )}
    </div>
  );
}
