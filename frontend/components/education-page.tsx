import Link from "next/link";
const pages = {
  learn: { title: "Learn radar", text: "Radar measures microwave response. GCOV contains calibrated backscatter; GUNW is needed for displacement. A backscatter difference alone does not identify flooding or vegetation loss." },
  playground: { title: "Radar Playground", text: "Explore the clearly labeled fictional educational console. Switch polarization, compare dates and play the timeline to learn how a radar investigation works. The sample patterns are not NASA measurements." },
  mission: { title: "Your radar investigation", text: "Choose a place, select two dates and a shared polarization, compare imagery, check the evidence and download a report. Use Explore tools in the console for a five-step tour." },
  discoveries: { title: "Discoveries", text: "Browse the educational wetland, earthquake and forest examples. There are no validated NISAR detections in this release. Real NASA browse imagery is available separately from numerical analysis." },
  hypotheses: { title: "Hypothesis Lab", text: "An apparent radar change can reflect moisture, geometry, vegetation or processing artifacts. Compare alternative explanations and seek independent evidence. The evidence checklist is not a confidence probability." },
  disasters: { title: "Surface change studies", text: "Explore fictional wetland, forest and earthquake examples. No real disaster extent, ground movement or environmental loss is established by these samples." },
};
export function EducationPage({ destination }: { destination: keyof typeof pages }) {
  const page = pages[destination];
  return <main className="data-workspace"><nav><Link href="/">Home</Link> · <Link href="/explore">Explore</Link> · <Link href="/processed">Processed GCOV</Link></nav><h1>{page.title}</h1><p>{page.text}</p><p><Link href="/explore">Open the educational console and its six Discovery Lab tools</Link></p><p><Link href="/nisar-prototype">View limited real NASA browse imagery</Link></p></main>;
}
export function StudyPage({ label, browse = false }: { label: string; browse?: boolean }) {
  return <main className="data-workspace"><Link href="/">Home</Link><h1>{label} study</h1><p>This location is an educational investigation, not a validated detection. Search for {label} in the console to select its fictional sample.</p><Link href="/explore">Open educational console</Link>{browse && <p><Link href="/nisar-prototype">Real Everglades NASA browse imagery</Link> is a separate, nonquantitative view. The scientific pair remains NOT CLEARED.</p>}</main>;
}
