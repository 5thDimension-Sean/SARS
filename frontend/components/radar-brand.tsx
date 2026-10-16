/** Original SAR-Waltz identity: an orbital radar pulse, not the Neuron Industries mark. */
export function RadarBrand({ size = 32, animated = false }: { size?: number; animated?: boolean }) {
  return <svg viewBox="0 0 64 64" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg"
    className={"radar-brand-mark"+(animated?" radar-brand-animated":"")} role="img" aria-label="SAR-Waltz radar pulse logo">
    <rect width="62" height="62" x="1" y="1" rx="13" fill="#111a1f" stroke="#42636a"/>
    <circle cx="32" cy="32" r="19.5" stroke="#4a7279" strokeWidth="1.3" strokeDasharray="2 4"/>
    <path d="M15 32H22L26 20L33 44L39 28L43 32H49" stroke="#86d9d8" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round"/>
    <path d="M44.5 14.5A25 25 0 0 1 49 19" stroke="#eeb778" strokeWidth="3.5" strokeLinecap="round"/>
    <circle cx="49.2" cy="19.2" r="2.7" fill="#eeb778"/>
    <path d="M8 10V8H10M54 54H56V52" stroke="#78979f" strokeWidth="1.5"/>
  </svg>;
}
