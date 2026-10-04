import raw from "@/data/sar-learning.json";
import type { PhenomenonId } from "@/lib/sample-schema";
export interface LearningTopic {
  id: string;
  title: string;
  summary: string;
  detail: string;
  keywords: string[];
  modes?: PhenomenonId[];
}
export interface SarLearning {
  schemaVersion: string;
  provenance: "educational";
  source: { label: string; url: string; handbook: string; note: string };
  topics: LearningTopic[];
  bands: {
    band: string;
    frequencyGHz: string;
    wavelengthCm: string;
    use: string;
  }[];
  scattering: { mechanism: string; sensitive: string; examples: string }[];
  modeNotes: Record<
    PhenomenonId,
    { title: string; body: string; unit: string }
  >;
}
export const sarLearning = raw as SarLearning;
