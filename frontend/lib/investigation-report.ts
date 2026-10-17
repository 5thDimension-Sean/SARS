import type {Acquisition,Hotspot,Phenomenon,Polarization} from "./sample-schema";

/** Conservative descriptions: fictional sample metrics must never become evidence claims. */
export type InvestigationSnapshot={
  provenance:"SAMPLE"|"DERIVED GCOV";
  whereTitle:string;
  whereDetail:string;
  howTitle:string;
  howDetail:string;
  evidenceTitle:string;
  evidenceDetail:string;
  warnings:string[];
  report:string;
  changeOverlayAvailable:boolean;
  twoDates:boolean;
};
const fmt=(iso:string)=>iso.slice(0,10);
const coordinate=(lat:number,lon:number)=>
  Math.abs(lat).toFixed(4)+"° "+(lat>=0?"N":"S")+", "+Math.abs(lon).toFixed(4)+"° "+(lon>=0?"E":"W");

export function buildInvestigationSnapshot({
  phenomenon,location,before,after,polarization
}:{phenomenon:Phenomenon;location:Hotspot;before:Acquisition;after:Acquisition;polarization:Polarization}):InvestigationSnapshot {
  const derived=location.provenance==="derived"&&before.provenance==="derived"&&after.provenance==="derived";
  const twoDates=before.date!==after.date;
  const difference=derived&&twoDates&&location.changeLayers?.some(
    item=>item.type==="dbDiff"&&item.pol===polarization&&item.from===before.date&&item.to===after.date
  )===true;
  const whereTitle=location.region;
  const whereDetail=derived
    ?"Footprint midpoint: "+coordinate(location.coordinates.latitude,location.coordinates.longitude)+". Not a detected event."
    :"Reference point: "+coordinate(location.coordinates.latitude,location.coordinates.longitude)+". Map pixels are fictional.";
  const howTitle=twoDates
    ?fmt(before.date)+" → "+fmt(after.date)
    :"Choose two different dates";
  const howDetail=!twoDates
    ?"Both views show the same acquisition; no temporal change can be inferred."
    :!derived
      ?"Illustrative imagery only; these pixels are not measured NISAR radar data."
      :difference
        ?polarization+" processed GCOV later-minus-earlier dB overlay is available for this exact date pair."
        :polarization+" processed GCOV images are available, but no matched difference overlay exists for this date pair.";
  const evidenceTitle=derived
    ?difference?"Measured radar response":"Processed radar imagery"
    :"Demonstration only";
  const evidenceDetail=derived
    ?"Radar brightness or its difference does not by itself establish flooding, deforestation, damage, or displacement."
    :"No real surface change has been measured here. Values, acquisitions, and illustrated events are sample data.";
  const warnings=derived?(location.processingNotes??[]).filter(w=>w.startsWith("WARN:")):[];
  const source=derived?(after.source??"Processed NISAR GCOV manifest"):"Fictional sample dataset";
  const product=derived?"Processed NISAR GCOV":"Fictional "+after.productType+" demonstration";
  const note=[
    "SAR-Waltz · Investigation evidence note",
    "Status: "+(derived?"DERIVED RADAR DATA — CAUSE NOT VALIDATED":"SAMPLE DEMONSTRATION — NOT AN OBSERVATION"),
    "Location: "+location.label+" ("+location.region+")",
    "Geographic "+(derived?"footprint midpoint":"reference point")+": "+coordinate(location.coordinates.latitude,location.coordinates.longitude),
    "Location reference: "+location.coordinateSource,
    "Acquisition pair: "+fmt(before.date)+" → "+fmt(after.date),
    "Polarization: "+polarization,
    "Product: "+product,
    "Source: "+source,
    "Before processing version: "+before.productVersion,
    "After processing version: "+after.productVersion,
    "Temporal comparison: "+(twoDates?"two selected dates":"same acquisition on both sides"),
    "Matched dB difference overlay: "+(difference?"yes":"no"),
    "What the image shows: "+howDetail,
    "What the evidence supports: "+evidenceDetail,
    "Scientific limitation: "+phenomenon.limitation,
    ...(warnings.length?["Processing warnings:",...warnings.map(w=>"- "+w)]:[]),
    "",
    "IMPORTANT: A radar signal change is not proof of its physical cause. Confirm with",
    "acquisition geometry, quality masks, independent reference data and site context."
  ].join("\n");
  return {
    provenance:derived?"DERIVED GCOV":"SAMPLE",
    whereTitle,whereDetail,
    howTitle,howDetail,
    evidenceTitle,evidenceDetail,
    warnings,report:note,
    changeOverlayAvailable:difference,
    twoDates
  };
}
