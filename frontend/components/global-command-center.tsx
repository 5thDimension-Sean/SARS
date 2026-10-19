"use client";
import {useEffect,useState} from "react";
import {BookOpen,Compass,FlaskConical,History,MapPin,Search,Satellite,ScanSearch,ShieldCheck,SlidersHorizontal} from "lucide-react";
import {CommandDialog,CommandInput,CommandList,CommandEmpty,CommandGroup,CommandItem} from "@/components/ui/command";
import {siteHref} from "@/components/site-navigation";
import {studySites} from "@/lib/study-sites";
import {readSavedViews,type SavedView,viewLink} from "@/lib/saved-investigations";
const destinations=[
  {label:"Home",detail:"Start here",path:"/",icon:Compass},
  {label:"Guided Mission",detail:"Four-step first investigation",path:"/mission/",icon:Compass},
  {label:"Explore radar",detail:"Compare satellite images",path:"/explore/",icon:Satellite},
  {label:"Discoveries",detail:"Saved investigations and study sites",path:"/discoveries/",icon:History},
  {label:"Hypothesis Lab",detail:"Test possible explanations",path:"/hypotheses/",icon:FlaskConical},
  {label:"Radar Playground",detail:"Interactive educational simulation",path:"/playground/",icon:SlidersHorizontal},
  {label:"Learn radar",detail:"SAR basics, science and limitations",path:"/learn/",icon:BookOpen},
  {label:"Geographic map",detail:"Distance and annotation tools",path:"/map/",icon:MapPin},
  {label:"Disaster playbooks",detail:"Flood, forest and earthquake guides",path:"/disasters/",icon:ShieldCheck}
] as const;
const tools=[
  {label:"Investigate a map point",tool:"detect",search:"microscope click pixel measure inspect",icon:ScanSearch},
  {label:"Radar versus optical",tool:"optical",search:"cloud optical satellite imagery",icon:Satellite},
  {label:"Check evidence",tool:"evidence",search:"quality reliability source validation",icon:ShieldCheck},
  {label:"Earth's Waltz animation",tool:"waltz",search:"timeline play dates time series",icon:History},
  {label:"Make a report",tool:"report",search:"download print evidence",icon:BookOpen},
  {label:"One-minute tour",tool:"guide",search:"help walkthrough",icon:Compass}
] as const;
export function openSiteSearch(){if(typeof window!=="undefined")window.dispatchEvent(new Event("sarwaltz:open-search"));}
export function SearchLauncher(){
  return <button className="minimal-search-launcher" aria-label="Search pages, places and tools" title="Search everywhere (Ctrl+K)" type="button" onClick={openSiteSearch}>
    <Search size={15}/><span>Search</span><kbd>Ctrl K</kbd>
  </button>;
}
export function GlobalCommandCenter(){
  const [open,setOpen]=useState(false);
  const [saved,setSaved]=useState<SavedView[]>([]);
  useEffect(()=>{
    const openSearch=()=>{
      try{setSaved(readSavedViews(window.localStorage));}catch{setSaved([]);}
      setOpen(true);
    };
    const shortcut=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();event.stopImmediatePropagation();
        openSearch();
      }
    };
    window.addEventListener("keydown",shortcut,{capture:true});
    window.addEventListener("sarwaltz:open-search",openSearch);
    return ()=>{
      window.removeEventListener("keydown",shortcut,{capture:true});
      window.removeEventListener("sarwaltz:open-search",openSearch);
    };
  },[]);
  function go(path:string){setOpen(false);window.location.assign(siteHref(path));}
  return <CommandDialog open={open} onOpenChange={setOpen}
    title="Search SAR-Waltz" description="Find a page, study area, analysis tool, or saved investigation."
    className="minimal-global-command">
    <CommandInput autoFocus placeholder="Search pages, places, tools, saved views…"/>
    <CommandList>
      <CommandEmpty>No result found. Try a place name, evidence, or mission.</CommandEmpty>
      <CommandGroup heading="Go to a page">
        {destinations.map(item=><CommandItem key={item.path}
          value={item.label+" "+item.detail} onSelect={()=>go(item.path)}>
          <item.icon size={16}/><div><strong>{item.label}</strong><small>{item.detail}</small></div>
        </CommandItem>)}
      </CommandGroup>
      <CommandGroup heading="Jump to a study">
        {studySites.map(site=><CommandItem key={site.hotspotId}
          value={site.name+" "+site.region+" "+site.tag+" "+site.headline}
          onSelect={()=>go("/explore/?hotspot="+encodeURIComponent(site.hotspotId))}>
          <MapPin size={16}/><div><strong>{site.name}</strong><small>{site.region} · sample study</small></div>
        </CommandItem>)}
      </CommandGroup>
      <CommandGroup heading="Open an Explore tool">
        {tools.map(item=><CommandItem key={item.tool}
          value={item.label+" "+item.search} onSelect={()=>go("/explore/?tool="+item.tool)}>
          <item.icon size={16}/><div><strong>{item.label}</strong><small>Open in radar workspace</small></div>
        </CommandItem>)}
      </CommandGroup>
      {saved.length>0&&<CommandGroup heading="Your saved views (this browser)">
        {saved.map(view=><CommandItem key={view.id}
          value={"saved "+view.label+" "+view.hotspot+" "+view.pol}
          onSelect={()=>go(viewLink(view))}>
          <History size={16}/><div><strong>{view.label}</strong><small>{view.before.slice(0,10)} → {view.after.slice(0,10)} · {view.pol}</small></div>
        </CommandItem>)}
      </CommandGroup>}
    </CommandList>
    <div className="minimal-command-footer">ESC closes · ↑↓ navigates · ENTER opens · SAMPLE and DERIVED remain distinct</div>
  </CommandDialog>;
}
