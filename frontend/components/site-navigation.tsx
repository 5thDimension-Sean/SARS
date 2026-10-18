import { RadarBrand } from "@/components/radar-brand";
import { MotionReveal } from "@/components/motion-reveal";
import {ChevronDown} from "lucide-react";

const pages = [
  { label: "Home", path: "/" },
  { label: "Mission", path: "/mission/" },
  { label: "Explore", path: "/explore/" },
  { label: "Discoveries", path: "/discoveries/" },
  { label: "Hypotheses", path: "/hypotheses/" },
  { label: "Learn", path: "/learn/" },
];
const morePages = [
  {label:"Five field studies",path:"/#locations"},
  {label:"Map laboratory",path:"/map/"},
  {label:"Disaster playbooks",path:"/disasters/"},
  {label:"Our team",path:"/#team"},
];

export function siteHref(path: string) {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + path;
}

export function SiteNavigation({ compact = false }: { compact?: boolean }) {
  return (
    <nav className={"competition-nav" + (compact ? " competition-nav-compact" : "")} aria-label="Main website navigation">
      {pages.map((page) => (
        <a key={page.path} href={siteHref(page.path)}>{page.label}</a>
      ))}
      <details className="competition-nav-more">
        <summary>More <ChevronDown size={13} aria-hidden="true"/></summary>
        <div className="competition-nav-menu">
          {morePages.map(page=><a key={page.path} href={siteHref(page.path)}>{page.label}</a>)}
        </div>
      </details>
    </nav>
  );
}

export function CompetitionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="competition-site">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="competition-header">
        <a href={siteHref("/")} className="competition-brand" aria-label="SAR-Waltz home">
          <RadarBrand size={39} />
          <span><strong>SAR-Waltz</strong><small>EARTH OBSERVATION CONSOLE</small></span>
        </a>
        <SiteNavigation />
      </header>
      <MotionReveal />
      <main id="main-content" className="competition-content">{children}</main>
      <footer className="competition-footer">
        <span>NASA Space Apps · Dancing with SARs</span>
        <span>Sample visualizations are illustrative · Processed observations are separately labeled</span>
        <div className="competition-footer-links"><a href={siteHref("/mission/")}>Mission</a><a href={siteHref("/discoveries/")}>Discoveries</a><a href={siteHref("/hypotheses/")}>Hypothesis Lab</a><a href={siteHref("/map/")}>Map Lab</a><a href={siteHref("/disasters/")}>Disasters</a></div>
      </footer>
    </div>
  );
}
