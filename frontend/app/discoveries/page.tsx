import type {Metadata} from "next";
import {DiscoveriesExperience} from "@/components/discoveries-experience";
export const metadata:Metadata={title:"Discoveries | SAR-Waltz",description:"Explore study sites, saved investigations and verified processed SAR inputs."};
export default function DiscoveriesPage(){return <DiscoveriesExperience/>;}
