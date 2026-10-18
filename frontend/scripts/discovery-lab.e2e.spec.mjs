import {test,expect} from "@playwright/test";

const url="http://127.0.0.1:4173/SARS/explore/";
async function openTool(page,name){
  await page.getByRole("button",{name:"Show Discovery Lab tools"}).click();
  await page.getByRole("group",{name:"Choose a discovery tool"}).getByRole("button",{name,exact:true}).click();
}
test.describe("SAR-Waltz Discovery Lab sample-mode browser journeys",()=>{
  test.beforeEach(async({page})=>{
    await page.setViewportSize({width:1440,height:900});
    await page.goto(url);
    await expect(page.getByRole("button",{name:"Show Discovery Lab tools"})).toBeVisible();
    await expect(page.getByRole("group",{name:"Choose a discovery tool"})).toHaveCount(0);
  });
  test("six tools remain navigable; sample mode never claims measured radar results",async({page})=>{
    await page.getByRole("button",{name:"Show Discovery Lab tools"}).click();
    const tools=page.getByRole("group",{name:"Choose a discovery tool"});
    for(const name of ["Investigate","Radar / Optical","Check Evidence","Earth's Waltz","Make a Report","1-Minute Tour"])
      await expect(tools.getByRole("button",{name})).toBeVisible();
    await tools.getByRole("button",{name:"Investigate"}).click();
    await expect(page.getByText("Click the map",{exact:false})).toBeVisible();
    const map=page.locator(".surface-scene");
    // Find a genuinely exposed map pixel: the floating Discovery Lab drawer
    // covers part of the top-right, while the date timeline covers the bottom-left.
    const point=await map.evaluate(scene=>{
      const rect=scene.getBoundingClientRect();
      for(const [rx,ry] of [[.18,.34],[.32,.28],[.18,.48],[.42,.31],[.75,.72]]){
        const x=rect.left+rect.width*rx,y=rect.top+rect.height*ry;
        const target=document.elementFromPoint(x,y);
        if(target&&scene.contains(target))return {x,y};
      }
      return null;
    });
    if(!point)throw new Error("No unobstructed map area available for investigation");
    await page.mouse.click(point.x,point.y);
    await expect(page.locator(".discovery-map-pin")).toBeVisible();
    await expect(page.getByText("No real change is being claimed.",{exact:false})).toBeVisible();

    await openTool(page,"Radar / Optical");
    await expect(page.getByText("No verified co-registered optical image",{exact:false})).toBeVisible();
    await openTool(page,"Check Evidence");
    await expect(page.getByText("Observed radar products")).toBeVisible();
    await expect(page.getByText("Independent validation")).toBeVisible();
    await openTool(page,"Earth's Waltz");
    await expect(page.getByRole("button",{name:"Play the animated sequence"})).toBeVisible();
    await openTool(page,"1-Minute Tour");
    await expect(page.getByText("Choose the place")).toBeVisible();
    await page.getByRole("button",{name:"Next step"}).click();
    await expect(page.getByText("Pick your before and after")).toBeVisible();
  });
  test("downloaded sample report is accurately labeled",async({page})=>{
    await openTool(page,"Make a Report");
    const promise=page.waitForEvent("download");
    await page.getByRole("button",{name:"Download printable visual report"}).click();
    const file=await promise;
    expect(file.suggestedFilename()).toMatch(/^sar-waltz-.*\.html$/);
    await expect(page.getByText("SAMPLE · NOT AN OBSERVED CHANGE",{exact:false})).toBeVisible();
  });
  test("declutter defaults preserve map controls, chart access and observation data",async({page})=>{
    await expect(page.locator(".system-bar")).toHaveCount(0);
    const left=page.locator(".workspace-left-pane");
    await expect(left.locator("details").filter({hasText:"PLACES"})).toHaveAttribute("open","");
    const options=left.locator("details").filter({hasText:"MAP OPTIONS"});
    await expect(options).not.toHaveAttribute("open","");
    await options.locator("summary").click();
    await expect(page.getByRole("switch",{name:"Show coordinate grid"}).first()).not.toBeChecked();
    await page.getByRole("switch",{name:"Show coordinate grid"}).first().click();
    await expect(page.getByRole("switch",{name:"Show coordinate grid"}).first()).toBeChecked();
    await options.locator("summary").click();
    const analysis=page.locator(".workspace-right-pane");
    const charts=analysis.locator("details").filter({hasText:"CHARTS & DATA DETAILS"});
    await expect(charts).not.toHaveAttribute("open","");
    await charts.locator("summary").click();
    await expect(analysis.getByRole("tab",{name:"Signal chart"})).toBeVisible();
    await analysis.getByRole("tab",{name:"Data details"}).click();
    await expect(analysis.getByText("SELECTED ACQUISITION")).toBeVisible();
  });
  test("shrinking a sidebar gives its width to the central map",async({page})=>{
    const left=page.locator(".workspace-left-pane"),middle=page.locator(".workspace-center-pane");
    const resize=left.locator(".panel-resize-edge.edge-e");
    const startLeft=await left.boundingBox(),startMap=await middle.boundingBox(),handle=await resize.boundingBox();
    if(!startLeft||!startMap||!handle)throw new Error("Missing resize handles");
    const x=handle.x+handle.width/2,y=handle.y+handle.height/2;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x-55,y,{steps:6});await page.mouse.up();
    await expect.poll(async()=>((await left.boundingBox())?.width??0)).toBeLessThan(startLeft.width-25);
    await expect.poll(async()=>((await middle.boundingBox())?.width??0)).toBeGreaterThan(startMap.width+25);
  });
  test("map cannot be resized and always fills the central column",async({page})=>{
    const middle=page.locator(".workspace-center-pane");
    await expect(middle.locator(":scope > .panel-resize-edge")).toHaveCount(0);
    await expect(middle.locator(".view-heading")).toBeVisible();
    const map=page.locator(".map-viewport");
    const parent=await middle.boundingBox(),child=await map.boundingBox();
    if(!parent||!child)throw new Error("Central map is not available");
    expect(Math.abs(child.x-parent.x)).toBeLessThan(3);
    expect(Math.abs(child.x+child.width-parent.x-parent.width)).toBeLessThan(3);
    expect(Math.abs(child.y+child.height-parent.y-parent.height)).toBeLessThan(3);
    await expect(page.locator(".timeline-resizable .panel-resize-edge.edge-se")).toHaveCount(1);
    await expect(page.locator(".workspace-left-pane .panel-resize-edge.edge-e")).toHaveCount(1);
    await expect(page.locator(".workspace-right-pane .panel-resize-edge.edge-w")).toHaveCount(1);
  });
  test("mouse wheel zoom stays under the cursor and zooms out in reverse",async({page})=>{
    const scene=page.locator(".surface-scene");
    const image=page.locator(".surface-image").first();
    const rect=await scene.boundingBox();
    if(!rect)throw new Error("Map image is not visible");
    const localX=rect.width*.32,localY=rect.height*.36;
    const sample=async()=>{
      return await image.evaluate(el=>{
        const matrix=new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return {zoom:matrix.a,x:matrix.m41,y:matrix.m42};
      });
    };
    const sourceAt=(state,x,y)=>({
      x:(x-rect.width/2-state.x)/state.zoom,
      y:(y-rect.height/2-state.y)/state.zoom
    });
    const start=await sample();
    await page.mouse.move(rect.x+localX,rect.y+localY);
    await page.mouse.wheel(0,-140);
    await expect.poll(async()=> (await sample()).zoom).toBeGreaterThan(start.zoom+.1);
    const zoomed=await sample();
    const before=sourceAt(start,localX,localY),after=sourceAt(zoomed,localX,localY);
    expect(Math.abs(before.x-after.x)).toBeLessThan(.2);
    expect(Math.abs(before.y-after.y)).toBeLessThan(.2);
    await page.mouse.wheel(0,140);
    await expect.poll(async()=> (await sample()).zoom).toBeLessThan(zoomed.zoom-.1);
    const restored=await sample();
    expect(restored.zoom).toBeCloseTo(start.zoom,3);
    expect(restored.x).toBeCloseTo(start.x,1);
    expect(restored.y).toBeCloseTo(start.y,1);
  });
  test("timeline can shrink, fullscreen keeps map visible, right-drag pans",async({page})=>{
    const timeline=page.locator(".timeline-resizable"),edge=timeline.locator(".panel-resize-edge.edge-se");
    const before=await timeline.boundingBox(),handle=await edge.boundingBox();
    if(!before||!handle)throw new Error("Date panel not displayed");
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-50,handle.y+handle.height/2-25,{steps:5});await page.mouse.up();
    await expect.poll(async()=>((await timeline.boundingBox())?.width??0)).toBeLessThan(before.width-20);
    await page.getByRole("button",{name:"Expand viewport"}).click();
    await expect(page.locator(".expanded-viewport")).toBeVisible();
    await page.getByRole("button",{name:"Zoom in"}).click();
    await page.getByRole("button",{name:"Zoom in"}).click();
    const root=await page.locator(".surface-scene").boundingBox();
    if(!root)throw new Error("No map surface");
    await page.mouse.move(root.x+root.width*.5,root.y+root.height*.6);
    await page.mouse.down({button:"right"});
    await page.mouse.move(root.x+root.width*.6,root.y+root.height*.6,{steps:5});
    await page.mouse.up({button:"right"});
    const transform=await page.locator(".surface-image").first().evaluate(el=>getComputedStyle(el).transform);
    expect(transform).not.toBe("none");
    await page.getByRole("button",{name:"Exit expanded viewport"}).click();
    await expect(page.locator(".expanded-viewport")).toHaveCount(0);
  });
});


test.describe("Multi-page SAR-Waltz navigation and bookmark flows",()=>{
  test.beforeEach(async({page})=>{await page.setViewportSize({width:1440,height:900});});
  test("home links directly to specialized pages and retains legacy destinations",async({page})=>{
    await page.goto("http://127.0.0.1:4173/SARS/");
    await expect(page.getByRole("navigation",{name:"Main website navigation"}).getByRole("link",{name:"Mission"})).toBeVisible();
    await expect(page.getByRole("link",{name:"Start a guided mission"})).toBeVisible();
    await page.getByRole("navigation",{name:"Main website navigation"}).getByText("More").click();
    await expect(page.getByRole("link",{name:"Map laboratory"})).toBeVisible();
    await expect(page.getByRole("link",{name:"Disaster playbooks"})).toBeVisible();
  });
  test("Mission runs a guided four-step journey and hands off selected location to Explore",async({page})=>{
    await page.goto("http://127.0.0.1:4173/SARS/mission/");
    await expect(page.getByRole("heading",{name:"Your first Earth investigation."})).toBeVisible();
    await page.getByRole("button",{name:/Rondônia/}).click();
    await expect(page.getByText("Can repeated radar observations",{exact:false})).toBeVisible();
    await page.getByRole("button",{name:"Next step"}).click();
    await expect(page.getByText("Open the radar workspace",{exact:false})).toBeVisible();
    await page.getByRole("link",{name:/Open Rondônia in Explore/}).click();
    await expect(page).toHaveURL(/\/SARS\/explore\/\?/);
    await expect(page.getByText("Forest frontier A",{exact:false}).first()).toBeVisible();
  });
  test("Hypothesis Lab switches scientific scenarios without claiming confirmed detection",async({page})=>{
    await page.goto("http://127.0.0.1:4173/SARS/hypotheses/");
    await page.getByRole("button",{name:"Forests and disturbance"}).click();
    await page.getByRole("button",{name:/Possible clearing/}).click();
    await expect(page.getByText("not a classified detection",{exact:false})).toBeVisible();
    await page.getByRole("button",{name:"Faults and ground motion"}).click();
    await expect(page.getByText("GCOV intensity images alone cannot establish displacement")).toBeVisible();
    await expect(page.getByRole("link",{name:"Examine sample imagery"})).toHaveAttribute("href",/hotspot=E-01/);
  });
  test("saving a view persists in this browser, opens the right dates and can be removed",async({page})=>{
    await page.goto("http://127.0.0.1:4173/SARS/explore/?hotspot=F-01&before=2026-07-03&after=2026-09-25&pol=HH&x=0.3500&y=0.6800");
    await expect(page.getByText("Forest frontier A",{exact:false}).first()).toBeVisible();
    await page.getByRole("button",{name:"Save view"}).click();
    await expect(page.getByRole("status").filter({hasText:"Saved to this browser"})).toBeVisible();
    await page.goto("http://127.0.0.1:4173/SARS/discoveries/");
    await page.getByRole("button",{name:/Saved views/}).click();
    await expect(page.getByText("Forest frontier A · FORESTS")).toBeVisible();
    await expect(page.getByText("2026-07-03 → 2026-09-25 · HH",{exact:false})).toBeVisible();
    await page.getByRole("link",{name:"Open",exact:true}).click();
    await expect(page).toHaveURL(/hotspot=F-01/);
    await expect(page).toHaveURL(/pol=HH/);
    await expect(page.locator(".discovery-map-pin")).toBeVisible();
    await page.goto("http://127.0.0.1:4173/SARS/discoveries/");
    await page.getByRole("button",{name:/Saved views/}).click();
    await page.getByRole("button",{name:/Remove saved view/}).click();
    await expect(page.getByText("No saved views yet")).toBeVisible();
  });
  test("Discoveries truthfully shows no processed radar data when manifest is a sample sentinel",async({page})=>{
    await page.goto("http://127.0.0.1:4173/SARS/discoveries/");
    await page.getByRole("button",{name:/Processed data/}).click();
    await expect(page.getByText("Ready when NASA data arrives")).toBeVisible();
    await expect(page.getByText("No processed observations have been published yet.")).toBeVisible();
  });
});
