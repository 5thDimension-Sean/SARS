import type { Metadata } from "next";
import { ArrowUpRight, Orbit, Satellite, ScanLine, HeartHandshake, ShieldCheck, ArrowRight } from "lucide-react";
import { CompetitionShell, siteHref } from "@/components/site-navigation";
import { studySites } from "@/lib/study-sites";
import { SampleSignalInstrument } from "@/components/sample-signal-instrument";
import { RadarFeatureTour } from "@/components/radar-feature-tour";

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
      <SampleSignalInstrument />
    </section>

    <section className="story-section story-why" data-reveal>
      <div><p className="story-eyebrow">01 / WHY WE BUILT THIS</p><h2>Invisible signals.<br />Human consequences.</h2></div>
      <div className="story-prose"><p>When a wetland floods, a forest is disturbed, or the ground shifts, the impact is bigger than a change in an image. These environments touch wildlife, communities, and the places we call home.</p><p>Radar can revisit locations even when cloud cover makes optical observation difficult. But a radar change is a clue, not automatically a conclusion. We built SAR-Waltz to make that distinction visible.</p></div>
    </section>

    <section className="story-section" id="locations" data-reveal>
      <div className="story-section-head"><div><p className="story-eyebrow">02 / FIVE LOCATIONS</p><h2>Five places. Five questions.</h2></div><p>Every study starts with a human question, then opens the science behind the signal.</p></div>
      <div className="story-study-grid">
        {studySites.map((site,i)=><a key={site.slug} className={"story-study-card story-theme-"+site.theme} href={siteHref("/studies/"+site.slug+"/")}>
          <div className="story-card-art" aria-hidden="true"><span className="story-card-topography"/><span className="story-card-index">0{i+1}</span></div>
          <div className="story-card-body"><span className="story-tag">{site.tag} · {site.region}</span><h3>{site.name}</h3><p>{site.headline}</p><span className="story-card-link">Investigate location <ArrowUpRight size={15}/></span></div>
        </a>)}
      </div>
    </section>

    <RadarFeatureTour />

    <section className="story-section story-why" data-reveal>
      <div><p className="story-eyebrow">04 / HAZARD EXPLAINERS</p><h2>Before. During. After.</h2><p className="story-prose">Explore how investigators might use radar before, during, and after floods, earthquakes, and forest disturbances—with clear scientific limitations.</p></div>
      <div className="story-method-steps"><article><ShieldCheck/><div><h3>Disaster investigation playbooks</h3><p>Scientific questions, radar observations, and what each sensor cannot establish.</p><a className="story-text-link" href={siteHref("/disasters/")}>Explore disasters <ArrowRight size={17}/></a></div></article>
      <article><ScanLine/><div><h3>Interactive geographic toolbox</h3><p>Inspect a real geographic map, mark areas, measure distances, and export annotations.</p><a className="story-text-link" href={siteHref("/map/")}>Open map laboratory <ArrowRight size={17}/></a></div></article></div>
    </section>
    <section className="story-section story-team" id="team" data-reveal>
      <p className="story-eyebrow">05 / MEET THE TEAM</p>
      <h2>Built by two curious problem-solvers.</h2>
      <p className="story-team-intro">We believe powerful Earth-observation tools should be understandable, engaging, and scientifically honest. Our project combines software engineering, data exploration, and a shared curiosity about our changing planet.</p>
      <div className="story-team-grid">
        <article><div className="story-avatar"><span>RZ</span></div><div><p className="story-tag">CO-CREATOR · WINSTON CHURCHILL HIGH SCHOOL</p><h3>Roger Zhang</h3><p>I&apos;m a sophomore at Winston Churchill High School who enjoys turning creative ideas into practical technology. Through VEX Robotics and tennis, I&apos;ve developed a passion for teamwork, problem-solving, and challenging myself. For SAR-Waltz, I contributed to project design, research, user experience, and engineering.</p></div></article>
        <article><div className="story-avatar"><span>S</span></div><div><p className="story-tag">CO-CREATOR · MONTGOMERY BLAIR HIGH SCHOOL</p><h3>Sean</h3><p>Sean is a student at Montgomery Blair High School and a co-creator of SAR-Waltz, helping build a project that makes satellite radar exploration more accessible.</p></div></article>
      </div>
      <p className="story-edit-note">Team photos and further details about Sean can be added before the final submission.</p>
    </section>

    <section className="story-finale" data-reveal><p className="story-eyebrow">THE NEXT QUESTION IS YOURS</p><h2>Don't just view the Earth.<br />Investigate it.</h2><a className="story-btn story-btn-primary" href={siteHref("/studies/everglades/")}>Explore the first story <ArrowRight size={17}/></a></section>
  </CompetitionShell>;
}
