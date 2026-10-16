import { Orbit } from "lucide-react";

const pages = [
  { label: "Home", path: "/" },
  { label: "Explore", path: "/explore/" },
  { label: "Compare", path: "/compare/" },
  { label: "Locations", path: "/locations/" },
  { label: "Learn", path: "/learn/" },
  { label: "About", path: "/about/" },
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
          <Orbit size={28} aria-hidden="true" />
          <span><strong>SAR-Waltz</strong><small>EARTH OBSERVATION CONSOLE</small></span>
        </a>
        <SiteNavigation />
      </header>
      <main id="main-content" className="competition-content">{children}</main>
      <footer className="competition-footer">
        <span>NASA Space Apps · Dancing with SARs</span>
        <span>Sample visualizations are illustrative · Processed observations are separately labeled</span>
      </footer>
    </div>
  );
}
