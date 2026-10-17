"use client";
import {useState} from "react";
import {ArrowUpRight,FileDown,MapPin,ScanSearch,ShieldCheck,BookOpen,FileText} from "lucide-react";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {siteHref} from "@/components/site-navigation";
import type {InvestigationSnapshot} from "@/lib/investigation-report";

export function InvestigationGuide({
  snapshot,hotspotId,hasMultiple,comparePreset
}:{
  snapshot:InvestigationSnapshot;
  hotspotId:string;
  hasMultiple:boolean;
  comparePreset:(kind:"first"|"previous")=>void;
}){
  const [detailsOpen,setDetailsOpen]=useState(false);
  const isSample=snapshot.provenance==="SAMPLE";
  function saveNote(){
    const file=new Blob([snapshot.report+"\n"],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(file);
    const link=document.createElement("a");
    link.href=url;
    link.download="sar-waltz-evidence-"+hotspotId.replace(/[^a-z0-9-]/gi,"-")+".txt";
    document.body.appendChild(link);
    link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <>
    <section className="investigation-guide" aria-label="Earth change investigation findings">
      <div className="investigation-guide-top">
        <div><span className="investigation-guide-kicker">FIELD INVESTIGATION / THREE QUESTIONS</span><strong>What can the radar actually tell us?</strong></div>
        <span className={"investigation-source"+(isSample?"":" is-derived")}>{isSample?"SAMPLE · NOT OBSERVED":"DERIVED RADAR · NOT VALIDATED CAUSE"}</span>
      </div>
      <div className="investigation-questions">
        <article className="investigation-question">
          <div className="investigation-question-label"><MapPin size={15} aria-hidden="true"/><span>01 / WHERE</span></div>
          <strong>{snapshot.whereTitle}</strong>
          <p>{snapshot.whereDetail}</p>
        </article>
        <article className="investigation-question">
          <div className="investigation-question-label"><ScanSearch size={15} aria-hidden="true"/><span>02 / HOW</span></div>
          <strong>{snapshot.howTitle}</strong>
          <p>{snapshot.howDetail}</p>
        </article>
        <article className="investigation-question">
          <div className="investigation-question-label"><ShieldCheck size={15} aria-hidden="true"/><span>03 / EVIDENCE</span></div>
          <strong>{snapshot.evidenceTitle}</strong>
          <p>{snapshot.evidenceDetail}</p>
        </article>
      </div>
      <div className="investigation-guide-actions">
        <span className="investigation-guide-hint">Choose a location on the left, pick two dates below, then drag the image divider.</span>
        <div className="investigation-guide-buttons">
          <button type="button" disabled={!hasMultiple} onClick={()=>comparePreset("first")} title="Compare first and most recent acquisition">First ↔ latest</button>
          <button type="button" disabled={!hasMultiple} onClick={()=>comparePreset("previous")} title="Compare two most recent acquisitions">Recent pair</button>
          <button type="button" className="investigation-open-report" onClick={()=>setDetailsOpen(true)}><FileText size={14} aria-hidden="true"/> Evidence note</button>
          <a href={siteHref("/map/?hotspot="+encodeURIComponent(hotspotId))} className="investigation-map-link">View geography <ArrowUpRight size={14} aria-hidden="true"/></a>
        </div>
      </div>
      {snapshot.warnings.length>0&&<p className="investigation-warning" role="status">Processing caution: {snapshot.warnings.length} warning(s) in source metadata. Open Evidence note.</p>}
    </section>
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="investigation-dialog" aria-describedby="investigation-dialog-description">
        <DialogTitle>Investigation evidence note</DialogTitle>
        <DialogDescription id="investigation-dialog-description">A traceable summary of the selected geographic area, dates, radar product, and scientific limitations. This does not certify a physical event.</DialogDescription>
        <div className="investigation-dialog-status">{isSample?"SAMPLE DEMONSTRATION":"DERIVED PRODUCTS · INTERPRETATION PENDING"}</div>
        <pre>{snapshot.report}</pre>
        <div className="investigation-dialog-actions">
          <button type="button" onClick={saveNote}><FileDown size={16} aria-hidden="true"/> Save text note</button>
          <a href={siteHref("/learn/")}><BookOpen size={15} aria-hidden="true"/> Read SAR basics</a>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
