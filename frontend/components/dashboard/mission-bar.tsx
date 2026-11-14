"use client";
import { Orbit, Search, Satellite, MapPin } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Acquisition, SampleDataset } from "@/lib/sample-schema";
import { displayDate } from "@/lib/dashboard-utils";
import { useEffect, useRef } from "react";
import Link from "next/link";
export function MissionBar({
  acquisition,
  data,
  searchOpen,
  onSearchOpen,
  onLocation,
}: {
  acquisition: Acquisition;
  data: SampleDataset;
  searchOpen: boolean;
  onSearchOpen: (v: boolean) => void;
  onLocation: (p: number, l: number) => void;
}) {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !searchOpen)
      document
        .querySelector<HTMLButtonElement>('[aria-label="Search locations"]')
        ?.focus();
    wasOpen.current = searchOpen;
  }, [searchOpen]);
  return (
    <>
      <header className="mission-bar">
        <Link className="brand" href="/" aria-label="Dancing with SARs home">
          <Orbit size={31} aria-hidden />
          <div>
            <strong>
              Dancing with <span>SARs</span>
            </strong>
            <small>EARTH OBSERVATION CONSOLE</small>
          </div>
        </Link>
        <span className="sample-badge">
          <span className="sample-pulse" />
          SAMPLE DATA
        </span>
        <Link className="browse-link" href="/nisar-prototype">NASA browse</Link>
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
          onClick={() => onSearchOpen(true)}
          aria-label="Search locations"
        >
          <Search size={16} aria-hidden />
          <span className="search-label">Search a location</span>
          <kbd>Ctrl K</kbd>
        </button>
      </header>
      <CommandDialog
        open={searchOpen}
        onOpenChange={onSearchOpen}
        title="Find an observation area"
        description="Search six known sample hotspots by geographic name or area label."
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
          REAL LOCATIONS · ILLUSTRATIVE DATA{" "}
          <span>↑ ↓ to navigate · Enter to select</span>
        </div>
      </CommandDialog>
    </>
  );
}
