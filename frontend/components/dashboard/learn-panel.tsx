"use client";
import { ExternalLink } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { sarLearning } from "@/lib/sar-learning";
import type { PhenomenonId } from "@/lib/sample-schema";
export function LearnPanel({ phenomenonId }: { phenomenonId: PhenomenonId }) {
  const { topics, bands, scattering, modeNotes, source } = sarLearning;
  const note = modeNotes[phenomenonId];
  const ordered = [
    ...topics.filter((t) => t.modes?.includes(phenomenonId)),
    ...topics.filter((t) => !t.modes?.includes(phenomenonId)),
  ];
  return (
    <section className="rail-section learn-panel" aria-label="How SAR sees this">
      <div className="eyebrow">HOW SAR SEES THIS</div>
      <div className="learn-mode">
        <strong>{note.title}</strong>
        <p>{note.body}</p>
        <span className="learn-unit">{note.unit} · SAMPLE DATA</span>
      </div>
      <Accordion type="single" collapsible className="learn-topics">
        {ordered.map((t) => (
          <AccordionItem value={t.id} key={t.id}>
            <AccordionTrigger>{t.title}</AccordionTrigger>
            <AccordionContent>
              <p className="learn-summary">{t.summary}</p>
              <p>{t.detail}</p>
              {t.id === "wavelength" && (
                <table className="learn-table">
                  <caption className="sr-only">SAR bands</caption>
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>GHz</th>
                      <th>cm</th>
                      <th>Typical use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((b) => (
                      <tr key={b.band}>
                        <th scope="row">{b.band}</th>
                        <td>{b.frequencyGHz}</td>
                        <td>{b.wavelengthCm}</td>
                        <td>{b.use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {t.id === "scattering" && (
                <table className="learn-table">
                  <caption className="sr-only">Scattering mechanisms</caption>
                  <thead>
                    <tr>
                      <th>Mechanism</th>
                      <th>Most sensitive</th>
                      <th>Examples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scattering.map((s) => (
                      <tr key={s.mechanism}>
                        <th scope="row">{s.mechanism}</th>
                        <td>{s.sensitive}</td>
                        <td>{s.examples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="sign-note">{source.note}</p>
      <a
        className="cog-link"
        href={source.url}
        target="_blank"
        rel="noreferrer"
      >
        Source: {source.label} <ExternalLink size={11} aria-hidden />
      </a>
    </section>
  );
}
