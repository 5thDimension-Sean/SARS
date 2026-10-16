/** Geographic annotations, independent of the map renderer. Coordinates are [longitude, latitude]. */
export type Position = [number, number];
export type DrawTool = "pan" | "point" | "line" | "polygon" | "rectangle" | "measure" | "note";
export type AnnotationKind = Exclude<DrawTool, "pan">;
export interface GeoAnnotation {
  id: string;
  kind: AnnotationKind;
  points: Position[];
  label: string;
}
export function validPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length === 2 &&
    value.every(v => typeof v === "number" && Number.isFinite(v)) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
export function loadAnnotations(raw: string | null): GeoAnnotation[] {
  if (!raw || raw.length > 250000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const kinds = ["point", "line", "polygon", "rectangle", "measure", "note"];
    return value.filter((item): item is GeoAnnotation =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" && item.id.length < 100 &&
      kinds.includes(item.kind) &&
      typeof item.label === "string" && item.label.length <= 200 &&
      Array.isArray(item.points) && item.points.length > 0 && item.points.length <= 250 &&
      item.points.every(validPosition)
    ).slice(0, 100);
  } catch {
    return [];
  }
}
export function rectangleRing(a: Position, b: Position): Position[] {
  return [[a[0],a[1]],[a[0],b[1]],[b[0],b[1]],[b[0],a[1]],[a[0],a[1]]];
}
export function distanceKm(points: Position[]): number {
  const radius = 6371.0088;
  let total = 0;
  for(let i=1;i<points.length;i++){
    const [lon1,lat1]=points[i-1].map(x=>x*Math.PI/180);
    const [lon2,lat2]=points[i].map(x=>x*Math.PI/180);
    const a = Math.sin((lat2-lat1)/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin((lon2-lon1)/2)**2;
    total += 2*radius*Math.asin(Math.min(1,Math.sqrt(a)));
  }
  return total;
}
/** Approximate spherical polygon area; suitable for exploration, not cadastral surveying. */
export function areaKm2(points: Position[]): number {
  if(points.length<3) return 0;
  const ring = points[0][0]===points[points.length-1][0] && points[0][1]===points[points.length-1][1]
    ? points : [...points,points[0]];
  let sum=0;
  for(let i=1;i<ring.length;i++){
    const [x1,y1]=ring[i-1].map(x=>x*Math.PI/180);
    const [x2,y2]=ring[i].map(x=>x*Math.PI/180);
    let dx=x2-x1;
    if(dx>Math.PI)dx-=2*Math.PI;
    if(dx< -Math.PI)dx+=2*Math.PI;
    sum += dx*(2+Math.sin(y1)+Math.sin(y2));
  }
  return Math.min(4*Math.PI*6371.0088**2,Math.abs(sum)*6371.0088**2/2);
}
export function annotationGeoJSON(annotations: GeoAnnotation[]) {
  const features = annotations.flatMap(a => {
    const point=a.points[0];
    const ring=a.kind==="rectangle" ? rectangleRing(a.points[0],a.points[1]??a.points[0]) : [...a.points,a.points[0]];
    const geometry = a.kind==="point" || a.kind==="note"
      ? {type:"Point",coordinates:point}
      : a.kind==="line" || a.kind==="measure"
        ? {type:"LineString",coordinates:a.points}
        : {type:"Polygon",coordinates:[ring]};
    return [{type:"Feature",properties:{id:a.id,label:a.label,kind:a.kind},geometry}];
  });
  return {type:"FeatureCollection",features};
}
export function annotationDetail(a:GeoAnnotation):string {
  if(a.kind==="polygon" || a.kind==="rectangle") return areaKm2(a.kind==="rectangle"?rectangleRing(a.points[0],a.points[1]??a.points[0]):a.points).toFixed(2)+" km² (approx.)";
  if(a.kind==="line" || a.kind==="measure")return distanceKm(a.points).toFixed(2)+" km (approx.)";
  return a.points[0][1].toFixed(4)+"°, "+a.points[0][0].toFixed(4)+"°";
}
