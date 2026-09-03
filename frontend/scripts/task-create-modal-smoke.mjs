// Render real shell components in an isolated service: no production data writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const fixture = "\nimport React,{useState} from \"react\";\nimport {createRoot} from \"react-dom/client\";\nimport {TaskCreateModal} from \"./src/TaskCreateModal.jsx\";\nimport {ProjectIssuePanel} from \"./src/App.jsx\";\nimport \"./src/styles.css\";\nimport \"./src/sidebarWorkspace.css\";\nfunction Harness(){\n const [mode,setMode]=useState(\"default\");\n window.qaOpen=setMode; window.qaCalls ||= []; window.qaIssueCalls ||= [];\n return <main style={{padding:24}}>\n <button id=\"open-task\" onClick={()=>setMode(\"default\")}>업무 추가</button>\n <ProjectIssuePanel issues={[]} canWrite={true} onCreate={fields=>{window.qaIssueCalls.push(fields);return new Promise(resolve=>{window.qaResolveIssue=resolve;});}}/>\n {mode && <TaskCreateModal key={mode} completed={mode===\"completed\"} role=\"ns\" clientName=\"UND\" todayValue=\"2026-09-03\" onClose={()=>setMode(null)} onSubmit={(type,fields)=>{\n  window.qaCalls.push({type,fields}); return new Promise((resolve,reject)=>{window.qaResolve=resolve;window.qaReject=reject;});\n }}/>}\n </main>;\n}\ncreateRoot(document.getElementById(\"root\")).render(<Harness/>);\n";
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


  await wait('document.querySelector(".task-create-dialog")');
  const fill=async(name,value)=>{
    await evaluate("(()=>{const el=document.querySelector('[name="+name+"]');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,"+JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await delay(60);
  };
  const button=async(label,scope=".task-create-dialog")=>{
    assert.ok(await evaluate("(()=>{const el=[...document.querySelectorAll("+JSON.stringify(scope+" button")+")].find(b=>b.textContent.trim()==="+JSON.stringify(label)+");el?.click();return !!el;})()"));await delay(60);
  };
  const values=()=>evaluate('Object.fromEntries([...document.querySelectorAll(".task-create-dialog [name]")].map(e=>[e.name,e.value]))');
  let fields=await values();
  assert.equal(fields.planned_start_date,"2026-09-03");assert.equal(fields.due_date,"2026-09-09");
  assert.ok(await evaluate('document.querySelector(".task-create-submit").disabled'));
  assert.equal(await evaluate('document.activeElement.name'),"title");
  assert.equal(await evaluate('[...document.querySelectorAll(".task-create-choices")][1].querySelector("[aria-pressed=true]").textContent.trim()'),"NS");
  await button("최근 7일");
  fields=await values();assert.equal(fields.planned_start_date,"2026-08-28");assert.equal(fields.due_date,"2026-09-03");
  await button("다음주");fields=await values();assert.equal(fields.planned_start_date,"2026-09-07");assert.equal(fields.due_date,"2026-09-13");
  await button("오늘부터 7일");
  await fill("title","인스타그램 9월 콘텐츠 제작");
  await fill("description","콘텐츠 기획안 정리, 디자인 제작 및 업로드 일정 확인");
  await button("포켓");await button("디자인");await button("진행");
  assert.equal(await evaluate('qaCalls.length'),0,"form edits must not write");
  const desktop=await evaluate('(()=>{const modal=document.querySelector(".task-create-dialog"),footer=modal.querySelector("footer"),body=modal.querySelector(".task-create-body");return {width:modal.offsetWidth,height:modal.offsetHeight,bottom:footer.getBoundingClientRect().bottom,scroll:body.scrollHeight>body.clientHeight};})()');
  assert.equal(desktop.width,680);assert.ok(desktop.bottom<=1050);
  if(process.env.QA_SCREENSHOT){const capture=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(process.env.QA_SCREENSHOT,Buffer.from(capture.data,"base64"));}
  await fill("due_date","2026-09-01");await click(".task-create-submit");
  assert.match(await evaluate('document.querySelector(".task-create-message").textContent'),/종료일/);
  assert.equal(await evaluate('qaCalls.length'),0);
  await button("오늘부터 7일");
  await evaluate('document.querySelector(".task-create-dialog form").requestSubmit();document.querySelector(".task-create-dialog form").requestSubmit();');
  await wait('qaCalls.length===1');
  assert.ok(await evaluate('document.querySelector(".task-create-fields").disabled'));
  assert.ok(await evaluate('document.querySelector(".task-create-submit").disabled'));
  await evaluate('qaReject(new Error("테스트 저장 실패 — 입력 유지"))');await wait('document.querySelector(".task-create-message.is-error")');
  assert.equal((await values()).title,"인스타그램 9월 콘텐츠 제작");
  assert.equal((await values()).description,"콘텐츠 기획안 정리, 디자인 제작 및 업로드 일정 확인");
  await click(".task-create-submit");await wait('qaCalls.length===2');
  const payload=await evaluate('qaCalls[1].fields');
  assert.equal(payload.responsible_org_code,"POCKET");assert.equal(payload.workstream_code,"DSN");assert.equal(payload.status_code,"IN_PROGRESS");
  assert.equal(JSON.parse(payload.schedule_dates_json).length,7);
  await evaluate('qaResolve({id:"test-only"})');await wait('!document.querySelector(".task-create-dialog")');
  const issueStyle=await evaluate('(()=>{const el=document.querySelector(".project-issue-add"),s=getComputedStyle(el);return {height:el.offsetHeight,color:s.color,background:s.backgroundColor,border:s.borderRadius};})()');
  assert.ok(issueStyle.height>=34);assert.equal(issueStyle.background,"rgb(36, 55, 94)");assert.equal(issueStyle.color,"rgb(255, 255, 255)");assert.equal(issueStyle.border,"8px");
  await click(".project-issue-add");await click(".project-issue-add");
  assert.equal(await evaluate('qaIssueCalls.length'),1);assert.ok(await evaluate('document.querySelector(".project-issue-add").disabled'));
  await evaluate('qaResolveIssue()');await wait('!document.querySelector(".project-issue-add").disabled');
  await evaluate('qaOpen("completed")');await wait('document.querySelector(".task-create-dialog")');
  fields=await values();assert.equal(fields.progress_percent,"100");assert.equal(fields.planned_start_date,"2026-08-28");assert.equal(fields.due_date,"2026-09-03");
  assert.ok(await evaluate('document.querySelector("[name=progress_percent]").readOnly'));
  await fill("title","완료된 영상 편집");await button("UND");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:700,deviceScaleFactor:1,mobile:true});await delay(150);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=390'),"mobile no horizontal overflow");
  assert.ok(await evaluate('document.querySelector(".task-create-dialog footer").getBoundingClientRect().bottom<=700'),"mobile save remains visible");
  assert.ok(await evaluate('document.querySelector(".task-create-body").scrollHeight>document.querySelector(".task-create-body").clientHeight'),"only form body scrolls");
  assert.ok(await evaluate('document.querySelector(".task-create-body").getBoundingClientRect().bottom <= document.querySelector(".task-create-dialog footer").getBoundingClientRect().top'),"form content stays above footer");
  if(process.env.QA_SCREENSHOT){const capture=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(process.env.QA_SCREENSHOT.replace(".png","-mobile.png"),Buffer.from(capture.data,"base64"));}
  await click(".task-create-close");
  assert.match(await evaluate('document.querySelector(".task-create-message").textContent'),/버릴까요/);
  await button("계속 작성");assert.equal((await values()).title,"완료된 영상 편집");
  await button("일정 미정");await click(".task-create-submit");
  await wait('qaCalls.length===3');
  const completed=await evaluate('qaCalls[2].fields');
  assert.equal(completed.status_code,"DONE");assert.equal(completed.progress_percent,100);assert.equal(completed.responsible_org_code,"CLIENT");
  assert.equal(Object.hasOwn(completed,"due_date"),false);
  await evaluate('qaResolve()');await wait('!document.querySelector(".task-create-dialog")');
  assert.equal(errors.length,0);
  console.log("PASS: date presets, validation, owner/status selection, duplicate-submit prevention, failed-draft retention, completed 100%, issue button and mobile layout.",JSON.stringify({desktop,issueStyle}));
} finally {socket?.close();chrome.kill();server.close();}
