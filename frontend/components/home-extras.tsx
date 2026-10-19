"use client";
import {useEffect,useRef} from "react";
import {ChevronDown} from "lucide-react";
export function HomeExtras({children}:{children:React.ReactNode}){
  const details=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const jump=()=>{
      if(["#locations","#team"].includes(window.location.hash)&&details.current){
        details.current.open=true;
      }
    };
    jump();
    window.addEventListener("hashchange",jump);
    return()=>window.removeEventListener("hashchange",jump);
  },[]);
  return <details ref={details} className="minimal-home-extras">
    <summary><span><strong>More about SAR-Waltz</strong><small>Explore locations, background science, tools and the team</small></span><ChevronDown size={20}/></summary>
    <div className="minimal-home-extra-content">{children}</div>
  </details>;
}
