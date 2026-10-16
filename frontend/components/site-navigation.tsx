import { RadarBrand } from "@/components/radar-brand";
import { MotionReveal } from "@/components/motion-reveal";

const pages = [
  { label: "Home", path: "/" },
  { label: "Five studies", path: "/#locations" },
  { label: "Explore", path: "/explore/" },
  { label: "Map tools", path: "/map/" },
  { label: "Disasters", path: "/disasters/" },
  { label: "Science", path: "/learn/" },
  { label: "Our team", path: "/#team" },
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
      </footer>
    </div>
  );
}
