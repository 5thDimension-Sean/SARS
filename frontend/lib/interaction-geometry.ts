export type PanelSize={width:number;height:number;left:number;top:number};
export type PanelEdge="n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw";
export type PanelLimits={width:number;height:number};
export function clampNumber(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
export function shrinkPanel(start:PanelSize,edge:PanelEdge,dx:number,dy:number,max:PanelLimits,min:PanelLimits):PanelSize{
  let {width,height,left,top}=start;
  if(edge.includes("e"))width=clampNumber(start.width+dx,Math.min(min.width,max.width-start.left),max.width-start.left);
  if(edge.includes("w")){
    const right=start.left+start.width;
    width=clampNumber(start.width-dx,Math.min(min.width,right),right);
    left=right-width;
  }
  if(edge.includes("s"))height=clampNumber(start.height+dy,Math.min(min.height,max.height-start.top),max.height-start.top);
  if(edge.includes("n")){
    const bottom=start.top+start.height;
    height=clampNumber(start.height-dy,Math.min(min.height,bottom),bottom);
    top=bottom-height;
  }
  return {width,height,left,top};
}
export function clampMapPan(x:number,y:number,zoom:number,width:number,height:number){
  const limitX=Math.max(0,(zoom-1)*width/2);
  const limitY=Math.max(0,(zoom-1)*height/2);
  return {x:clampNumber(x,-limitX,limitX),y:clampNumber(y,-limitY,limitY)};
}
