import type {Metadata} from "next";
import {MissionExperience} from "@/components/mission-experience";
export const metadata:Metadata={title:"Mission Mode | SAR-Waltz",description:"A guided Earth observation mission for first-time explorers."};
export default function MissionPage(){return <MissionExperience/>;}
