// Render real shell components in an isolated service: no production data writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const fixture = "\nimport React, {useState} from \"react\";\nimport {createRoot} from \"react-dom/client\";\nimport {TaskScheduleTimeline} from \"./src/App.jsx\";\nimport \"./src/styles.css\";\nconst tasks = [\n {id:\"qa-one\",title:\"채널 세팅 업무\",description:\"세부내용은 줄을 넘어서도 읽을 수 있어야 합니다. 실제 운영 업무 분류 표시.\",stream:\"MARKETING\",categoryCode:\"YOUTUBE\",statusCode:\"IN_PROGRESS\",progressPercent:25,responsibleOrgCode:\"NS\",plannedStartDate:\"2026-09-20\",dueDate:\"2026-09-30\",scheduleDates:null},\n {id:\"qa-two\",title:\"채널 디자인\",description:\"디자인 내용\",stream:\"DESIGN\",categoryCode:\"YOUTUBE\",statusCode:\"NOT_STARTED\",progressPercent:0,responsibleOrgCode:\"POCKET\",plannedStartDate:\"2026-09-20\",dueDate:\"2026-09-30\",scheduleDates:null},\n {id:\"qa-three\",title:\"인스타 영상\",description:\"영상 제작\",stream:\"VIDEO\",categoryCode:\"INSTAGRAM\",statusCode:\"DONE\",progressPercent:100,responsibleOrgCode:\"NS\",plannedStartDate:\"2026-09-21\",dueDate:\"2026-09-29\",scheduleDates:null}\n];\nconst project={id:\"qa\",name:\"QA 프로젝트\",clientName:\"UND\",startDate:\"2026-09-20\",endDate:\"2026-09-30\"};\nfunction Harness(){\n const [view,setView]=useState(\"table\"), [canWrite,setWrite]=useState(true), [items,setItems]=useState(tasks); window.qaTasks=setItems;\n window.qaView=setView; window.qaWrite=setWrite; window.qaWrites ||= [];\n return <main style={{padding:16,minWidth:0}}><TaskScheduleTimeline tasks={items} issues={[]} project={project} canWrite={canWrite} canWriteIssues={false} canEditProject={false} displayMode={view} onViewChange={setView} canViewActivity={false} onUpdate={async(task,fields)=>{window.qaWrites.push(fields);if(window.qaFail)throw Error(\"QA 저장 실패\");const map={status_code:\"statusCode\",progress_percent:\"progressPercent\",planned_start_date:\"plannedStartDate\",due_date:\"dueDate\"};const saved={...task,...Object.fromEntries(Object.entries(fields).map(([k,v])=>[map[k]||k,v]))};setItems(items=>items.map(item=>item.id===task.id?saved:item));return saved;}} onArchive={()=>{}} onCreate={()=>{}} /></main>;\n}\ncreateRoot(document.getElementById(\"root\")).render(<Harness/>);\n";
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
  const selectValue=async(selector,value)=>{assert.ok(await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event("change",{bubbles:true}));return true;})()`));await delay(120);};
  const width=selector=>evaluate(`Math.round(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().width)`);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});

  await wait('document.querySelector(".reference-task-table tbody tr")');
  const filterOption = async (tab,label) => {
    assert.ok(await evaluate(`(()=>{const option=[...document.querySelectorAll(${JSON.stringify("#schedule-filter-"+tab+" button")})].find(b=>b.textContent===${JSON.stringify(label)});option?.click();return !!option;})()`));
    await delay(80);
  };
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".schedule-filter-rows .task-schedule-filter-group > span")].map(b=>b.textContent)'),["매체별","업무 분야별","기간별","업무 상태별","담당 업무별"]);
  assert.equal(await evaluate('document.querySelectorAll(".schedule-filter-panel [role=tab],.schedule-filter-panel [role=tabpanel]").length'),0);
  assert.ok(await evaluate('[...document.querySelectorAll(".schedule-filter-rows [role=group]")].every(el=>el.getBoundingClientRect().height>0)'),"all filter groups visible together");
  assert.ok(await evaluate('document.querySelector(".schedule-filter-panel").getBoundingClientRect().top >= document.querySelector(".task-workspace-tabs").getBoundingClientRect().bottom'),"filters below table/Gantt tabs");
  await filterOption("owner","NS 업무");
  assert.equal(await evaluate('document.querySelectorAll(".reference-task-row").length'),2);
  await filterOption("media","YouTube");
  await filterOption("category","마케팅");
  await filterOption("status","진행");
  assert.equal(await evaluate('document.querySelectorAll(".reference-task-row").length'),1);
  assert.equal(await evaluate('document.querySelector(".reference-task-row .task-name").value'),"채널 세팅 업무");
  await evaluate('qaView("gantt")');await wait('document.querySelector(".g-row")');
  assert.equal(await evaluate('document.querySelectorAll(".g-row").length'),1,"same filter applies to Gantt");
  await evaluate('qaView("table")');await wait('document.querySelector(".reference-task-row")');
  await filterOption("category","디자인");
  assert.equal(await evaluate('document.querySelectorAll(".reference-task-row").length'),0);
  assert.ok(await evaluate('!!document.querySelector(".schedule-filter-panel")'),"zero-result filters remain usable");
  await click(".schedule-filter-reset");
  assert.equal(await evaluate('document.querySelectorAll(".reference-task-row").length'),3);
  const verticalOffsets=await evaluate(`[...document.querySelectorAll('.reference-task-row:first-child td')].map(td=>{const cell=td.querySelector('.reference-task-cell')||td.firstElementChild;if(!cell)return 0;const a=td.getBoundingClientRect(),b=cell.getBoundingClientRect();return Math.abs((a.top+a.height/2)-(b.top+b.height/2));})`);
  assert.ok(verticalOffsets.every(offset=>offset<=1.1),"all schedule cells are vertically centered: "+JSON.stringify(verticalOffsets));
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#schedule-filter-period button")].map(b=>b.textContent)'),["전체","오늘","지난주","이번주","다음주","이번달"]);
  const fill = async (selector,value) => {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    await delay(60);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).blur()`); await delay(100);
  };
  // Hit the visible number, not a programmatic click on the hidden icon.
  await evaluate('window.qaPickerCalls=[];HTMLInputElement.prototype.showPicker=function(){qaPickerCalls.push(this.getAttribute("aria-label"))}');
  for (const mobile of [false,true]) {
    await send("Emulation.setDeviceMetricsOverride",{width:mobile?390:1440,height:1050,deviceScaleFactor:1,mobile});
    await send("Emulation.setTouchEmulationEnabled",{enabled:mobile});
    for (const index of [0,1]) {
      const point=await evaluate(`(()=>{const el=document.querySelectorAll('.task-inline-date-display')[${index}];el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(mobile) { await send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...point,radiusX:1,radiusY:1}]});await send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]}); }
      else {await send("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});await send("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});}
      await delay(70);
    }
  }
  assert.deepEqual((await evaluate('qaPickerCalls')).slice(0,2),["채널 세팅 업무 시작일","채널 세팅 업무 종료일"]);
  const dateHitAreas=await evaluate('[...document.querySelectorAll(".task-inline-date-compact")].map(label=>{const input=label.querySelector("input"),a=label.getBoundingClientRect(),b=input.getBoundingClientRect();return {labelWidth:a.width,labelHeight:a.height,inputWidth:b.width,inputHeight:b.height}})');
  assert.ok(dateHitAreas.every(area=>Math.abs(area.labelWidth-area.inputWidth)<=2&&Math.abs(area.labelHeight-area.inputHeight)<=2),JSON.stringify(dateHitAreas));
  await send("Emulation.setTouchEmulationEnabled",{enabled:false});
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await fill('.task-inline-date',"2026-09-22");
  assert.equal(await evaluate('qaWrites.length'),1,"date edit saves once");
  assert.equal(await evaluate('qaWrites[0].planned_start_date'),"2026-09-22");
  assert.ok(await evaluate('qaWrites[0].schedule_dates_json.includes("2026-09-22")'),"Gantt dates saved with date range");
  await fill('.task-inline-progress input',"73");
  assert.equal(await evaluate('document.querySelector(".task-inline-progress input").value'),"73");
  await selectValue('.task-inline-status','DONE');
  assert.equal(await evaluate('document.querySelector(".task-inline-progress input").value'),"100");
  const numberMetrics=await evaluate(`(()=>{const el=document.querySelector('.task-inline-progress input'),s=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d');ctx.font=s.font;return {width:el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),text:ctx.measureText('100').width,appearance:s.appearance,scroll:el.scrollWidth,client:el.clientWidth};})()`);
  assert.ok(numberMetrics.width>=numberMetrics.text+2,JSON.stringify(numberMetrics));
  assert.equal(numberMetrics.appearance,"textfield");
  assert.equal(numberMetrics.scroll,numberMetrics.client);
  if(process.env.QA_INPUT_SCREENSHOT){await evaluate('document.querySelector(".reference-task-table").scrollIntoView({block:"start"})');const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(process.env.QA_INPUT_SCREENSHOT,Buffer.from(shot.data,"base64"));}
  await evaluate('qaView("gantt")');await wait('document.querySelector(".g-row")');
  await evaluate('qaView("table")');await wait('document.querySelector(".task-inline-progress input")');
  assert.equal(await evaluate('document.querySelector(".task-inline-progress input").value'),"100","saved completion survives remount");
  await fill('.task-inline-progress input',"35");
  assert.equal(await evaluate('document.querySelector(".task-inline-status").value'),"IN_PROGRESS");
  assert.equal(await evaluate('document.querySelector(".task-inline-progress input").value'),"35");
  await evaluate('window.qaFail=true');
  await fill('.task-inline-progress input',"80");
  assert.equal(await evaluate('document.querySelector(".task-inline-progress input").value'),"35","rejected progress rolls back");
  await evaluate('window.qaFail=false');
  await selectValue('.task-inline-status','DONE');await selectValue('.task-inline-status','ON_HOLD');
  assert.equal(await evaluate('document.querySelector(".task-inline-progress input").value'),"0","reopened task is not stuck at 100");
  await evaluate('qaTasks(items=>items.map((item,index)=>index===0?{...item,statusCode:"IN_PROGRESS"}:item));qaWrites=[];document.querySelector(".reference-task-table").parentElement.scrollLeft=0;window.scrollTo(0,0)');await delay(100);
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
    assert.ok(Math.abs(metrics.table-Math.max(1336,metrics.host))<1,JSON.stringify(metrics));
    assert.deepEqual(metrics.headers.slice(0,4),["","매체","업무분야","업무"]);
    assert.deepEqual(metrics.categories,["마케팅","디자인","영상"]);
    assert.ok(metrics.columns[3]>=289,"task title uses remaining width");
    assert.ok(Math.abs(metrics.columns[2]-64)<1,"workstream remains compact");
    assert.ok(Math.abs(metrics.columns[5]-126)<1,"date width stays compact");
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
    assert.equal(metrics.day,24);assert.equal(metrics.label,380);
    assert.ok(metrics.months.includes("2026년 10월"));assert.notEqual(metrics.colors[0],metrics.colors[1]);
    assert.notEqual(metrics.boundary,"none");
    console.log("gantt",viewport,JSON.stringify(metrics));
  }
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".g-task-status")].map(el=>el.value)'),["IN_PROGRESS","NOT_STARTED","DONE"]);
  const statusMetrics = await evaluate('[...document.querySelectorAll(".g-task-status")].map(el=>({width:el.getBoundingClientRect().width,text:el.options[el.selectedIndex].textContent,color:getComputedStyle(el).backgroundColor}))');
  assert.equal(new Set(statusMetrics.map(item=>item.color)).size,3);
  assert.ok(statusMetrics.every(item=>item.width>=39));
  assert.ok(await evaluate('[...document.querySelectorAll(".g-row .g-lbl")].every(el=>el.scrollWidth<=el.clientWidth)'),"status does not overflow task labels");
  await evaluate('qaTasks(items=>items.map((item,index)=>index===0?{...item,statusCode:"ON_HOLD"}:item))');
  await wait('document.querySelector(".g-task-status").value==="ON_HOLD"');
  assert.ok(await evaluate('document.querySelector(".g-task-status").classList.contains("is-hold")'));
  assert.equal(await evaluate('qaWrites.length'),0,"render/resize/filter must not save dates");
  await evaluate(`qaView("table");qaTasks([
    {id:"series-1",title:"콘텐츠 제작 / 업로드 1/10",description:"카드뉴스 제작·업로드",stream:"DESIGN",categoryCode:"INSTAGRAM",statusCode:"IN_PROGRESS",progressPercent:40,responsibleOrgCode:"NS",plannedStartDate:"2026-09-20",dueDate:"2026-09-22",scheduleDates:[]},
    {id:"series-2",title:"콘텐츠 제작 / 업로드 2/10",description:"카드뉴스 제작·업로드",stream:"DESIGN",categoryCode:"INSTAGRAM",statusCode:"DONE",progressPercent:100,responsibleOrgCode:"NS",plannedStartDate:"2026-09-23",dueDate:"2026-09-25",scheduleDates:[]}
  ])`);
  await wait('document.querySelectorAll(".reference-task-row").length===2');
  assert.equal(await evaluate('document.querySelectorAll(".task-series-summary,.task-series-toggle").length'),0,"numbered work is always fully expanded in the table");
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".reference-task-row .task-name")].map(el=>el.value)'),["콘텐츠 제작 / 업로드 1/10","콘텐츠 제작 / 업로드 2/10"]);
  await evaluate('qaView("gantt")');await wait('document.querySelectorAll(".g-row").length===2');
  assert.equal(await evaluate('document.querySelectorAll(".g-series-summary,.g-series-toggle").length'),0,"numbered work is always fully expanded in Gantt");
  if(process.env.QA_SCREENSHOT){const capture=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(process.env.QA_SCREENSHOT,Buffer.from(capture.data,"base64"));}
  await evaluate('qaView("table");qaWrite(false)');await wait('document.querySelector(".reference-task-table")');
  assert.equal(await evaluate('[...document.querySelectorAll(".reference-task-table th")].some(t=>t.textContent==="관리")'),false);
  assert.equal(await evaluate('document.querySelector(".task-inline-status").disabled'),true);
  assert.equal(await evaluate('document.querySelector("#schedule-filter-owner")'),null,"client cannot infer executor company");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(150);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=390'),"mobile uses inner scroll");
  assert.equal(errors.length,0,"no runtime errors");
  console.log("PASS: responsive schedule width, workstreams, client read-only, continuous calendar months, month boundaries, no automatic saves.");
} finally {socket?.close();chrome.kill();server.close();}
