import type { Metadata } from "next";
import { ArrowUpRight, Orbit, Satellite, ScanLine, HeartHandshake, ShieldCheck, ArrowRight } from "lucide-react";
import { CompetitionShell, siteHref } from "@/components/site-navigation";
import { studySites } from "@/lib/study-sites";

export const metadata: Metadata = {
  title: "SAR-Waltz | Earth's stories, revealed by radar",
  description: "A story-led NASA Space Apps Dancing with SARs experience. Discover five places, explore radar observations, and learn how science meets people.",
};

export default function Home() {
  return <CompetitionShell>
    <section className="story-hero">
      <div className="story-hero-copy">
        <p className="story-eyebrow"><Orbit size={17} /> NASA SPACE APPS · DANCING WITH SARs</p>
        <h1>Every place has a story.<br /><em>Radar helps us listen.</em></h1>
        <p className="story-intro">The Earth is always changing. Water shifts, forests evolve, and the ground moves. SAR-Waltz turns the radar signals behind those changes into investigations anyone can explore.</p>
        <div className="story-actions">
          <a className="story-btn story-btn-primary" href={siteHref("/studies/everglades/")}>Begin the journey <ArrowRight size={17}/></a>
          <a className="story-btn story-btn-ghost" href={siteHref("/explore/")}>Launch SAR workspace <ArrowUpRight size={16}/></a>
        </div>
        <p className="story-data-note"><ShieldCheck size={15}/> Fictional demo measurements are explicitly marked SAMPLE. Verified processed observations are labeled DERIVED.</p>
      </div>
      <div className="story-orbit-scene" aria-label="Abstract graphic representing radar scanning a planet; artistic illustration" role="img">
        <span className="story-orbit-one"/><span className="story-orbit-two"/><span className="story-planet"/>
        <span className="story-orbit-caption">OBSERVE · COMPARE · QUESTION</span>
      </div>
    </section>

    <section className="story-section story-why">
      <div><p className="story-eyebrow">01 / WHY WE BUILT THIS</p><h2>Invisible signals.<br />Human consequences.</h2></div>
      <div className="story-prose"><p>When a wetland floods, a forest is disturbed, or the ground shifts, the impact is bigger than a change in an image. These environments touch wildlife, communities, and the places we call home.</p><p>Radar can revisit locations even when cloud cover makes optical observation difficult. But a radar change is a clue, not automatically a conclusion. We built SAR-Waltz to make that distinction visible.</p></div>
    </section>

    <section className="story-section" id="locations">
      <div className="story-section-head"><div><p className="story-eyebrow">02 / FIVE LOCATIONS</p><h2>Five places. Five questions.</h2></div><p>Every study starts with a human question, then opens the science behind the signal.</p></div>
      <div className="story-study-grid">
        {studySites.map((site,i)=><a key={site.slug} className={"story-study-card story-theme-"+site.theme} href={siteHref("/studies/"+site.slug+"/")}>
          <div className="story-card-art" aria-hidden="true"><span className="story-card-topography"/><span className="story-card-index">0{i+1}</span></div>
          <div className="story-card-body"><span className="story-tag">{site.tag} · {site.region}</span><h3>{site.name}</h3><p>{site.headline}</p><span className="story-card-link">Investigate location <ArrowUpRight size={15}/></span></div>
        </a>)}
      </div>
    </section>

    <section className="story-section story-method">
      <div><p className="story-eyebrow">03 / SCIENCE MEETS DESIGN</p><h2>Powerful tools.<br />Understandable evidence.</h2><p>Explore the signal, annotate geographic regions, and communicate both findings and uncertainty. Our workflow is designed around real observation metadata, even when demonstrating with sample data.</p><a className="story-text-link" href={siteHref("/explore/")}>Explore the analysis workspace <ArrowRight size={17}/></a></div>
      <div className="story-method-steps">
        <article><Satellite/><div><h3>Observe</h3><p>Find a location and understand its SAR acquisitions and product types.</p></div></article>
        <article><ScanLine/><div><h3>Compare</h3><p>Explore signal differences through a timeline, before/after view, and charts.</p></div></article>
        <article><ShieldCheck/><div><h3>Question</h3><p>Check provenance, valid data, limitations, and alternative explanations.</p></div></article>
        <article><HeartHandshake/><div><h3>Connect</h3><p>Explain why a scientific observation could matter beyond the pixels.</p></div></article>
      </div>
    </section>

    <section className="story-section story-team" id="team">
      <p className="story-eyebrow">04 / MEET THE TEAM</p>
      <h2>Built by two curious problem-solvers.</h2>
      <p className="story-team-intro">We believe powerful Earth-observation tools should be understandable, engaging, and scientifically honest. Our project combines software engineering, data exploration, and a shared curiosity about our changing planet.</p>
      <div className="story-team-grid">
        <article><div className="story-avatar"><span>01</span></div><div><p className="story-tag">CO-CREATOR</p><h3>Team member one</h3><p>Project design, research, engineering, and storytelling.</p></div></article>
        <article><div className="story-avatar"><span>02</span></div><div><p className="story-tag">CO-CREATOR</p><h3>Team member two</h3><p>Scientific analysis, engineering, research, and user experience.</p></div></article>
      </div>
      <p className="story-edit-note">Team names, photos, and responsibilities are placeholders. Replace these details before submission.</p>
    </section>

    <section className="story-finale"><p className="story-eyebrow">THE NEXT QUESTION IS YOURS</p><h2>Don't just view the Earth.<br />Investigate it.</h2><a className="story-btn story-btn-primary" href={siteHref("/studies/everglades/")}>Explore the first story <ArrowRight size={17}/></a></section>
  </CompetitionShell>;
}
