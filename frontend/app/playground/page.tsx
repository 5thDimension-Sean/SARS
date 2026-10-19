import type {Metadata} from "next";
import {RadarPlayground} from "@/components/radar-playground";
export const metadata:Metadata={title:"Radar Playground | SAR-Waltz",description:"Experiment with conceptual terrain controls to learn what affects synthetic aperture radar."};
export default function PlaygroundPage(){return <RadarPlayground/>;}
