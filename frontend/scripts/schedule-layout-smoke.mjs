// Render real shell components in an isolated service: no production data writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const fixture = "\nimport React, {useState} from \"react\";\nimport {createRoot} from \"react-dom/client\";\nimport {TaskScheduleTimeline} from \"./src/App.jsx\";\nimport \"./src/styles.css\";\nconst tasks = [\n {id:\"qa-one\",title:\"채널 세팅 업무\",description:\"세부내용은 줄을 넘어서도 읽을 수 있어야 합니다. 실제 운영 업무 분류 표시.\",stream:\"마케팅\",categoryCode:\"YOUTUBE\",statusCode:\"IN_PROGRESS\",progressPercent:25,responsibleOrgCode:\"NS\",plannedStartDate:\"2026-09-20\",dueDate:\"2026-09-30\",scheduleDates:null},\n {id:\"qa-two\",title:\"채널 디자인\",description:\"디자인 내용\",stream:\"디자인\",categoryCode:\"YOUTUBE\",statusCode:\"NOT_STARTED\",progressPercent:0,responsibleOrgCode:\"POCKET\",plannedStartDate:\"2026-09-20\",dueDate:\"2026-09-30\",scheduleDates:null},\n {id:\"qa-three\",title:\"인스타 영상\",description:\"영상 제작\",stream:\"영상\",categoryCode:\"INSTAGRAM\",statusCode:\"DONE\",progressPercent:100,responsibleOrgCode:\"NS\",plannedStartDate:\"2026-09-21\",dueDate:\"2026-09-29\",scheduleDates:null}\n];\nconst project={id:\"qa\",name:\"QA 프로젝트\",clientName:\"UND\",startDate:\"2026-09-20\",endDate:\"2026-09-30\"};\nfunction Harness(){\n const [view,setView]=useState(\"table\"), [canWrite,setWrite]=useState(true);\n window.qaView=setView; window.qaWrite=setWrite; window.qaWrites=[];\n return <main style={{padding:16,minWidth:0}}><TaskScheduleTimeline tasks={tasks} issues={[]} project={project} canWrite={canWrite} canWriteIssues={false} canEditProject={false} displayMode={view} onViewChange={setView} canViewActivity={false} onUpdate={async(task,fields)=>{window.qaWrites.push(fields);return task;}} onArchive={()=>{}} onCreate={()=>{}} /></main>;\n}\ncreateRoot(document.getElementById(\"root\")).render(<Harness/>);\n";
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

  await wait('document.querySelector(".reference-task-table tbody tr")');
  for(const viewport of [1440,1920,1100]){
    await send("Emulation.setDeviceMetricsOverride",{width:viewport,height:1000,deviceScaleFactor:1,mobile:false});
    await delay(150);
    const metrics=await evaluate(`(()=>{
      const table=document.querySelector(".reference-task-table"), host=table.parentElement;
      const cells=[...table.querySelector("tbody tr").cells];
      return {table:table.getBoundingClientRect().width,host:host.clientWidth,
        columns:cells.map(c=>c.getBoundingClientRect().width),
        headers:[...table.querySelectorAll("th")].map(c=>c.textContent),
        categories:[...table.querySelectorAll(".reference-task-workstream")].map(c=>c.textContent)};
    })()`);
    assert.ok(Math.abs(metrics.table-Math.max(1308,metrics.host))<1,JSON.stringify(metrics));
    assert.deepEqual(metrics.headers.slice(0,3),["매체","업무분야","업무"]);
    assert.deepEqual(metrics.categories,["마케팅","디자인","영상"]);
    assert.ok(metrics.columns[2]>=289,"task title uses remaining width");
    assert.ok(Math.abs(metrics.columns[1]-64)<1,"workstream remains compact");
    assert.ok(Math.abs(metrics.columns[4]-126)<1,"date width stays compact");
    console.log("table",viewport,JSON.stringify(metrics));
  }
  await evaluate('qaView("gantt")'); await wait('document.querySelector(".reference-gantt")');
  for(const viewport of [1440,1920,1100]){
    await send("Emulation.setDeviceMetricsOverride",{width:viewport,height:1000,deviceScaleFactor:1,mobile:false});
    await delay(200);
    const metrics=await evaluate(`(()=>{
      const g=document.querySelector(".reference-gantt"),host=g.parentElement;
      const day=g.querySelector(".g-row .g-c"), boundary=g.querySelector(".g-row .month-start");
      return {width:g.getBoundingClientRect().width,host:host.clientWidth,day:day.getBoundingClientRect().width,
       label:g.querySelector(".g-lbl").getBoundingClientRect().width,
       months:[...g.querySelectorAll(".g-m")].map(x=>x.textContent),
       colors:[...g.querySelectorAll(".g-m")].map(x=>getComputedStyle(x).backgroundColor),
       boundary:boundary?getComputedStyle(boundary).boxShadow:"none",
       end:g.querySelector(".g-row .g-c:last-of-type")?.title};
    })()`);
    assert.ok(metrics.width>=metrics.host && metrics.width-metrics.host<=44,JSON.stringify(metrics));
    assert.equal(metrics.day,28);assert.equal(metrics.label,280);
    assert.ok(metrics.months.includes("2026년 10월"));assert.notEqual(metrics.colors[0],metrics.colors[1]);
    assert.notEqual(metrics.boundary,"none");
    console.log("gantt",viewport,JSON.stringify(metrics));
  }
  assert.equal(await evaluate('qaWrites.length'),0,"render/resize must not save dates");
  if(process.env.QA_SCREENSHOT){const capture=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(process.env.QA_SCREENSHOT,Buffer.from(capture.data,"base64"));}
  await evaluate('qaView("table");qaWrite(false)');await wait('document.querySelector(".reference-task-table")');
  assert.equal(await evaluate('[...document.querySelectorAll(".reference-task-table th")].some(t=>t.textContent==="관리")'),false);
  assert.equal(await evaluate('document.querySelector(".task-inline-status").disabled'),true);
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(150);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=390'),"mobile uses inner scroll");
  assert.equal(errors.length,0,"no runtime errors");
  console.log("PASS: responsive schedule width, workstreams, client read-only, continuous calendar months, month boundaries, no automatic saves.");
} finally {socket?.close();chrome.kill();server.close();}
