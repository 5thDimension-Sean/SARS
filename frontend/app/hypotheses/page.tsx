import type {Metadata} from "next";
import {HypothesesExperience} from "@/components/hypotheses-experience";
export const metadata:Metadata={title:"Hypothesis Lab | SAR-Waltz",description:"Explore scientific explanations, alternative hypotheses and evidence checks for radar signals."};
export default function HypothesesPage(){return <HypothesesExperience/>;}
