import { fmtDate, fmtDb, fmtInt, type Pair, type Pol, type PolEvidence } from "@/lib/investigation";

const W = 760, H = 400, M = { l: 64, r: 16, t: 44, b: 52 };
const COLORS = ["#f5f5f7", "#8e8e93"] as const; // white solid / gray dashed: distinguishable without colour

function niceMax(v: number) {
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step / 2) * step * 2 > v * 1.6 ? Math.ceil(v / step) * step : Math.ceil(v / step / 2) * step * 2;
}

/** Real per-bin pixel counts from evidence.json, drawn as two lines (one per acquisition). No smoothing. */
export function Histogram({ pol, ev, dates }: { pol: Pol; ev: PolEvidence; dates: Pair<string> }) {
  const bins = ev.bins;
  const lo = bins[0].lowDb, hi = bins[bins.length - 1].highDb;
  const yMax = niceMax(Math.max(...bins.flatMap((b) => b.counts)));
  const x = (db: number) => M.l + (db - lo) / (hi - lo) * (W - M.l - M.r);
  const y = (n: number) => H - M.b - n / yMax * (H - M.t - M.b);
  const centre = (b: (typeof bins)[number]) => (b.lowDb + b.highDb) / 2;
  const xTicks: number[] = [];
  for (let t = Math.ceil(lo / 5) * 5; t <= hi; t += 5) xTicks.push(t);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const medians = ev.observations.map((o) => o.medianDb);
  const label = `${pol} backscatter histogram, ${fmtDate(dates[0])} versus ${fmtDate(dates[1])}. Medians ${fmtDb(medians[0])} and ${fmtDb(medians[1])}.`;
  return <div style={{ overflowX: "auto" }}><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", minWidth: 300, height: "auto", display: "block" }}>
    <title>{label}</title>
    {yTicks.map((t) => <g key={t}>
      <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#ffffff1f" />
      <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#a1a1a6">{fmtInt(Math.round(t))}</text>
    </g>)}
    {xTicks.map((t) => <g key={t}>
      <line x1={x(t)} x2={x(t)} y1={H - M.b} y2={H - M.b + 5} stroke="#a1a1a6" />
      <text x={x(t)} y={H - M.b + 20} textAnchor="middle" fontSize="12" fill="#a1a1a6">{t.toString().replace("-", "−")}</text>
    </g>)}
    <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="#a1a1a6" />
    <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="#a1a1a6" />
    <text x={(M.l + W - M.r) / 2} y={H - 10} textAnchor="middle" fontSize="13" fill="#f5f5f7">{pol} backscatter, gamma-0 (dB)  — darker ← → brighter in the radar images</text>
    <text transform={`translate(16 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="#f5f5f7">Pixels per 0.52 dB bin</text>
    {[0, 1].map((i) => <polyline key={i} fill="none" stroke={COLORS[i]} strokeWidth="1.5" strokeDasharray={i ? "7 5" : undefined} strokeLinejoin="round"
      points={bins.map((b) => `${x(centre(b)).toFixed(1)},${y(b.counts[i]).toFixed(1)}`).join(" ")} />)}
    {medians.map((m, i) => <line key={i} x1={x(m)} x2={x(m)} y1={M.t} y2={H - M.b} stroke={COLORS[i]} strokeWidth="1.5" strokeDasharray="2 4" />)}
    <g transform={`translate(${M.l} 18)`}>
      {[0, 1].map((i) => <g key={i} transform={`translate(${i * 190} 0)`}>
        <line x2="30" stroke={COLORS[i]} strokeWidth="1.5" strokeDasharray={i ? "7 5" : undefined} />
        <text x="38" y="4" fontSize="12.5" fill="#f5f5f7">{fmtDate(dates[i])}</text>
      </g>)}
      <text x="390" y="4" fontSize="11.5" fill="#86868b">Dotted vertical lines = medians</text>
    </g>
  </svg></div>;
}
