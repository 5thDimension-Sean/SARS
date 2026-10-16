import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleHelp, Layers, ShieldCheck, Waves, Trees, Activity } from "lucide-react";
import { CompetitionShell, siteHref } from "@/components/site-navigation";
import { getStudySite, studySites } from "@/lib/study-sites";

export function generateStaticParams() { return studySites.map(site => ({ slug: site.slug })); }
export const dynamicParams = false;
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const { slug } = await params;
  const site = getStudySite(slug);
  return { title: site ? site.name+" | SAR-Waltz" : "Study not found", description: site?.headline };
}
export default async function StudyPage({ params }:{params:Promise<{slug:string}>}) {
  const { slug } = await params;
  const site = getStudySite(slug);
  if (!site) notFound();
  const index = studySites.findIndex(s=>s.slug===slug);
  const next = studySites[(index+1)%studySites.length];
  const Icon=site.theme==="water"?Waves:site.theme==="forest"?Trees:Activity;
  return <CompetitionShell>
    <section className={"story-study-hero story-theme-"+site.theme}>
      <div className="story-study-copy">
        <a className="story-back" href={siteHref("/#locations")}><ArrowLeft size={15}/> All locations</a>
        <p className="story-eyebrow">FIELD STUDY {String(index+1).padStart(2,"0")} / 05 · {site.tag}</p>
        <h1>{site.name}<span> / {site.region}</span></h1>
        <p className="study-hero-question">{site.headline}</p>
        <p className="study-hero-stakes">{site.stakes}</p>
        <div className="story-actions"><a className="story-btn story-btn-primary" href={siteHref("/explore/?hotspot="+encodeURIComponent(site.hotspotId))}>Open this location in the SAR workspace <ArrowUpRight size={16}/></a></div>
        <p className="story-data-note"><ShieldCheck size={15}/> The linked scenario is a SAMPLE simulation, not a verified observation.</p>
      </div>
      <div className="study-visual-wrap"><div className="study-visual" role="img" aria-label={"Abstract "+site.theme+" landscape inspired by "+site.name+"; not a satellite image"}>
        <Icon size={48} aria-hidden="true"/><span className="study-visual-ring one"/><span className="study-visual-ring two"/>
        <span className="study-visual-caption">CONCEPTUAL LANDSCAPE · NOT SATELLITE DATA</span>
      </div></div>
    </section>

    <section className="study-impact">
      <div><p className="story-eyebrow">WHY THIS PLACE MATTERS</p><h2>Beyond the image.</h2><p className="study-human-question">{site.humanQuestion}</p></div>
      <div className="study-impact-tags">{site.impact.map(label=><span key={label}>{label}</span>)}</div>
    </section>

    <section className="study-analysis-layout">
      <div className="study-analysis-main">
        <p className="story-eyebrow">A QUESTION FOR THE RADAR</p>
        <h2>{site.prompt}</h2>
        <p>{site.radarCanShow}</p>
        <div className="study-evidence"><div className="study-evidence-header"><Layers size={18}/><strong>Investigate the evidence</strong><span>SAMPLE</span></div>
          <ol>{site.exercises.map(ex=><li key={ex}>{ex}</li>)}</ol>
          <a className="story-text-link" href={siteHref("/explore/?hotspot="+encodeURIComponent(site.hotspotId))}>Launch analysis tools for {site.name} <ArrowRight size={16}/></a>
        </div>
      </div>
      <aside className="study-caution">
        <CircleHelp size={23}/>
        <h3>What the data cannot prove</h3>
        <p>{site.caution}</p>
        <h3>Evidence comes first</h3>
        <p>Explore the actual provenance badge, acquisition dates, polarization, statistics, and processing notes inside the dashboard. If a processed dataset is loaded, it is distinctly labeled DERIVED GCOV.</p>
      </aside>
    </section>

    <section className="study-next"><div><p className="story-eyebrow">CONTINUE THE JOURNEY</p><h2>Next: {next.name}</h2><p>{next.headline}</p></div><a className="story-btn story-btn-ghost" href={siteHref("/studies/"+next.slug+"/")}>Next study <ArrowRight size={17}/></a></section>
  </CompetitionShell>;
}
