export interface Camera { zoom: number; x: number; y: number }
export function zoomAt(camera: Camera, nextZoom: number, x: number, y: number): Camera {
  const zoom = Math.max(1, Math.min(3, nextZoom));
  const ratio = zoom / camera.zoom;
  return { zoom, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio };
}
