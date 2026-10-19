"use client";
import { Orbit, Search, Satellite, MapPin, ChevronDown } from "lucide-react";
import {siteHref} from "@/components/site-navigation";
import {openSiteSearch} from "@/components/global-command-center";
import {
  CommandDialog,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Acquisition, DashboardDataset } from "@/lib/sample-schema";
import { displayDate } from "@/lib/dashboard-utils";
import { useEffect, useRef } from "react";
export function MissionBar({
  acquisition,
  provenance,
  data,
  searchOpen,
  onSearchOpen,
  onLocation,
}: {
  acquisition: Acquisition;
  provenance: "sample" | "derived";
  data: DashboardDataset;
  searchOpen: boolean;
  onSearchOpen: (v: boolean) => void;
  onLocation: (p: number, l: number) => void;
}) {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !searchOpen)
      document
        .querySelector<HTMLButtonElement>('[aria-label="Search pages, places and tools"]')
        ?.focus();
    wasOpen.current = searchOpen;
  }, [searchOpen]);
  return (
    <>
      <header className="mission-bar">
        <a className="brand" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`} aria-label="SAR-Waltz home">
          <Orbit size={31} aria-hidden />
          <div>
            <strong>
              SAR<span>-Waltz</span>
            </strong>
            <small>EARTH OBSERVATION CONSOLE</small>
          </div>
        </a>
        <span
          className={`sample-badge ${provenance === "derived" ? "derived-badge" : ""}`}
        >
          {provenance === "sample" && <span className="sample-pulse" />}
          {provenance === "sample" ? "SAMPLE DATA" : "DERIVED GCOV"}
        </span>
        <nav className="mission-bar-pages" aria-label="Switch workspace page">
          <a href={siteHref("/mission/")}>Mission</a>
          <a href={siteHref("/discoveries/")}>Discoveries</a>
          <details className="mission-bar-more">
            <summary>More <ChevronDown size={13} aria-hidden="true"/></summary>
            <div className="mission-bar-dropdown">
              <a href={siteHref("/")}>Home</a>
              <a href={siteHref("/hypotheses/")}>Hypothesis Lab</a>
          <a href={siteHref("/playground/")}>Radar Playground</a>
              <a href={siteHref("/learn/")}>Learn SAR</a>
              <a href={siteHref("/map/")}>Geographic Map</a>
              <a href={siteHref("/disasters/")}>Disaster Playbooks</a>
            </div>
          </details>
        </nav>
        <div className="mission-context">
          <Satellite size={16} aria-hidden />
          <span>
            NISAR <b>L-BAND</b>
          </span>
          <span className="separator" />
          <span>
            LATEST PASS <b>{displayDate(acquisition.date, true)}</b>
          </span>
        </div>
        <button
          className="search-shell"
          onClick={openSiteSearch}
          aria-label="Search locations"
        >
          <Search size={16} aria-hidden />
          <span className="search-label">Search everything</span>
          <kbd>Ctrl K</kbd>
        </button>
      </header>
      <CommandDialog
        open={searchOpen}
        onOpenChange={onSearchOpen}
        title="Find an observation area"
        description="Search sample hotspots and any loaded GCOV frames by geographic name, area label, or track/frame."
        className="search-dialog"
      >
        <CommandInput placeholder="Try Everglades, Parkfield, or Amazon…" />
        <CommandList>
          <CommandEmpty>
            No matching hotspot. Try a geographic region.
          </CommandEmpty>
          {data.phenomena.map((p, pi) => (
            <CommandGroup heading={p.label} key={p.id}>
              {p.locations.map((l, li) => (
                <CommandItem
                  key={l.id}
                  value={`${l.label} ${l.region} ${l.aliases.join(" ")}`}
                  onSelect={() => {
                    onLocation(pi, li);
                    onSearchOpen(false);
                  }}
                >
                  <MapPin size={16} />
                  <div>
                    <strong>{l.label}</strong>
                    <small>{l.region}</small>
                  </div>
                  <span className="search-id">{l.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="search-help">
          REAL LOCATIONS · CHECK SOURCE BADGES{" "}
          <span>↑ ↓ to navigate · Enter to select</span>
        </div>
      </CommandDialog>
    </>
  );
}
