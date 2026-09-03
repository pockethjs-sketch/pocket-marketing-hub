// Render real shell components in an isolated service: no production data writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const fixture = `
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ProjectSidebar, Topbar } from "./src/App.jsx";
import { getNavigationPresentation } from "./src/navigationState.js";
import "./src/styles.css";
import "./src/sidebarWorkspace.css";
const clients = [{id:"one",name:"UND"},{id:"two",name:"무극"},{id:"three",name:"포켓컴퍼니"}];
function Harness() {
  const [collapsed,setCollapsed]=useState(true), [drawer,setDrawer]=useState(false), [width,setWidth]=useState(innerWidth);
  const [active,setActive]=useState("one"), [view,setView]=useState("tasks"), [role,setRole]=useState("pocket");
  window.setTestRole=setRole;
  useEffect(()=>{ const resize=()=>setWidth(innerWidth); addEventListener("resize",resize); return ()=>removeEventListener("resize",resize); },[]);
  const nav=getNavigationPresentation({role,compactViewport:width<=900,desktopCollapsed:collapsed,drawerOpen:drawer});
  const project={id:active,clientName:clients.find(c=>c.id===active).name,name:clients.find(c=>c.id===active).name+" 통합 마케팅 운영",allowedPages:["tasks","daily","performance","plan"]};
  const toggle=()=>nav.usesDrawer?setDrawer(v=>!v):setCollapsed(v=>!v);
  return <div className={"app-shell has-sidebar-workspace "+(nav.projectSidebarCollapsed?"is-sidebar-collapsed ":"")+(nav.isDrawerOpen?"is-navigation-drawer-open":"")}>
    <ProjectSidebar project={project} role={role} clients={clients} activeClient={active} onSelectClient={setActive} activeView={view} activePlanVariant="client" onView={setView} open={nav.isDrawerOpen} onClose={()=>setDrawer(false)} taskCount={0} visible={nav.projectSidebarVisible} navigation={nav} onToggleNavigation={toggle} canCreateProject={role!=="client"} onCreateProject={()=>window.created=(window.created||0)+1} onImportQuote={()=>window.imported=(window.imported||0)+1}/>
    {nav.isDrawerOpen&&<button className="mobile-overlay" aria-label="메뉴 닫기" onClick={()=>setDrawer(false)}/>}
    <div className="app-main"><Topbar project={project} actor={{name:"포켓컴퍼니",role}} search="" setSearch={()=>{}} notificationTasks={[]} notificationsLoaded={true}/><main className="content-canvas"><h1>{view==="tasks"?"업무":view==="progress"?"진행사항":view}</h1><p>실제 화면 컴포넌트의 탐색·배치 검사용 화면입니다.</p></main></div>
  </div>;
}
createRoot(document.getElementById("root")).render(<Harness/>);
`;
const bundle=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:"jsx"},bundle:true,write:false,outfile:"qa.js",jsx:"automatic",define:{"import.meta.env":"{}"}});
const js=bundle.outputFiles.find(f=>f.path.endsWith(".js")).text, css=bundle.outputFiles.find(f=>f.path.endsWith(".css")).text;
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/qa.js"?"text/javascript":req.url==="/qa.css"?"text/css":"text/html");res.end(req.url==="/qa.js"?js:req.url==="/qa.css"?css:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"><div id="root"></div><script src="/qa.js"></script></html>');});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const profile=await mkdtemp(path.join(tmpdir(),"hub-sidebar-qa-"));
const chrome=spawn(process.env.CHROME_PATH||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",["--headless=new","--disable-gpu","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--window-size=1440,1050","about:blank"],{stdio:"ignore",windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  let port;
  for(let i=0;i<60;i++){try{port=(await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];if(port)break;}catch{}await delay(100);}
  assert.ok(port,"headless browser ready");
  const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve=>socket.addEventListener("open",resolve,{once:true}));
  let id=0;const pending=new Map(), errors=[];
  socket.addEventListener("message",event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<60;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}throw Error("Timeout: "+expression);};
  const click=async selector=>{assert.ok(await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b?.click();return !!b;})()`));await delay(80);};
  const width=selector=>evaluate(`Math.round(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().width)`);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});
  await wait('document.querySelector(".sidebar-toggle")');
  assert.equal(await width(".project-sidebar"),56);
  assert.equal(await evaluate('document.querySelector("#project-navigation-content").hidden'),true);
  await click(".sidebar-toggle");
  assert.equal(await width(".project-sidebar"),264);
  assert.equal(await evaluate('document.querySelector(".app-main").getBoundingClientRect().left'),264);
  assert.equal(await evaluate('document.querySelectorAll(".sidebar-company-list button").length'),3);
  assert.equal(await evaluate('document.querySelector(".topbar").textContent.includes("프로젝트 생성")'),false);
  await click(".sidebar-company-list button:nth-child(2)");
  assert.equal(await evaluate('document.querySelector(".topbar-project-context small").textContent'),"무극");
  assert.equal(await width(".project-sidebar"),264,"desktop selection stays expanded");
  await evaluate('[...document.querySelectorAll(".project-nav button")].find(b=>b.textContent==="진행사항").click()');
  await wait('document.querySelector("main h1").textContent==="진행사항"');
  await click(".sidebar-project-create");await click(".sidebar-project-import");
  assert.equal(await evaluate("window.created"),1);assert.equal(await evaluate("window.imported"),1);
  assert.ok(await evaluate('Math.abs(document.querySelector(".sidebar-project-tools").getBoundingClientRect().bottom-innerHeight)<2'),"actions pinned to viewport bottom");
  if(process.env.QA_SCREENSHOT){const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(process.env.QA_SCREENSHOT,Buffer.from(shot.data,"base64"));}
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:640,deviceScaleFactor:1,mobile:false});
  await delay(120);
  assert.ok(await evaluate('document.querySelector(".sidebar-workspace-scroll").scrollHeight>document.querySelector(".sidebar-workspace-scroll").clientHeight'),"short screens scroll menus only");
  assert.ok(await evaluate('Math.abs(document.querySelector(".sidebar-project-tools").getBoundingClientRect().bottom-innerHeight)<2'),"actions stay pinned on short screens");
  await click(".sidebar-toggle");assert.equal(await width(".project-sidebar"),56);
  assert.equal(await evaluate('document.querySelector("main h1").textContent'),"진행사항","collapse does not navigate");
  await evaluate('window.setTestRole("client")');await click(".sidebar-toggle");
  assert.equal(await evaluate('document.querySelectorAll(".sidebar-project-tools").length'),0,"client creation stays forbidden");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(180);assert.equal(await width(".project-sidebar"),56);
  await click(".sidebar-toggle");assert.equal(await width(".project-sidebar"),280);
  assert.ok(await evaluate('(()=>{const b=document.querySelector(".sidebar-company-list button"),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()'),"mobile drawer is clickable above overlay");
  await click(".sidebar-company-list button:first-child");
  assert.equal(await width(".project-sidebar"),56,"mobile selection closes drawer");
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"),"no mobile overflow");
  assert.equal(errors.length,0,"no runtime errors");
  console.log("PASS: 56/264px shell; projects and menus; sticky bottom actions; project/page switching; client restrictions; 390px drawer; no runtime errors. No production writes.");
} finally {socket?.close();chrome.kill();server.close();}
