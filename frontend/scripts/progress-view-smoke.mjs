// Isolated browser QA: fixtures never contact or write production services.
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const fixture = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {ProjectProgressView} from "./src/App.jsx";
import "./src/styles.css";
window.meetingCalls = 0;
window.failWrite = false;
const source = { dailyMeetings: async () => {
  window.meetingCalls++;
  return {data:{items:[
    {meeting_id:"1",meeting_date:"2026-08-31",title:"공개 회의",discussion_text:"공개 논의",visibility_code:"CLIENT"},
    {meeting_id:"2",meeting_date:"2026-09-01",title:"내부 회의",discussion_text:"내부 논의",visibility_code:"POCKET_ONLY"}
  ]}};
}};
function Harness() {
  const [role,setRole] = useState("pocket");
  const [projectId,setProject] = useState("1");
  const [issues,setIssues] = useState([]);
  window.setTestRole = setRole;
  window.setTestProject = setProject;
  const [tasks] = useState([
    {id:"1",title:"완료 업무",categoryCode:"YOUTUBE",statusCode:"DONE",status:"완료",description:"제작 완료",updatedAt:"2026-09-02",owner:"NS",responsibleOrgCode:"NS",plannedStartDate:"2026-09-01",dueDate:"2026-09-02",createdAt:"2026-09-03T06:00:00Z"},
    {id:"2",title:"이번 주 제작",categoryCode:"INSTAGRAM",statusCode:"NOT_STARTED",plannedStartDate:"2026-09-03",dueDate:"2026-09-04",scheduleDates:null,owner:"NS",responsibleOrgCode:"NS",createdAt:new Date(Date.now()-1000).toISOString()}
  ]);
  const create = async fields => {
    if(window.failWrite)throw Error("QA 저장 실패");
    setIssues(current => [{id:"99",rowVersion:1,dueDate:fields.due_date,kind:fields.kind_text,relatedTask:fields.related_task_text,body:fields.body_text,owner:fields.owner_text,statusCode:fields.status_code,completionUrl:fields.completion_url,remarks:""},...current]);
  };
  const update = async (issue,fields) => {
    if(window.failWrite)throw Error("QA 저장 실패");
    setIssues(current => current.map(row => row.id === issue.id ? {...row, dueDate: 'due_date' in fields ? fields.due_date : row.dueDate, statusCode:fields.status_code || row.statusCode,remarks:fields.remarks ?? row.remarks,rowVersion:row.rowVersion+1} : row));
  };
  return <main style={{padding:24}}><ProjectProgressView key={role+projectId} project={{id:projectId,name:"QA 프로젝트",clientName:"고객사",allowedPages:role === "client" ? ["tasks"] : ["tasks","daily"]}} role={role} actorName="QA 담당자" source={source} taskPage={{items:projectId==="1"?tasks:[],issues:projectId==="1"?issues:[],issueCanWrite:role!=="client"}} canWrite={role!=="client"} onIssueCreate={create} onIssueUpdate={update} onNavigate={view=>window.navigated=view} /></main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
`;
const result = await build({ stdin:{contents:fixture,resolveDir:process.cwd(),loader:"jsx"}, bundle:true, write:false, outfile:"qa.js", jsx:"automatic", define:{"import.meta.env":"{}"} });
const js = result.outputFiles.find(file=>file.path.endsWith(".js")).text;
const css = result.outputFiles.find(file=>file.path.endsWith(".css")).text;
const server = createServer((req,res)=>{
  const asset = req.url === "/qa.js" ? js : req.url === "/qa.css" ? css : '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"><body><div id="root"></div><script src="/qa.js"></script></body></html>';
  res.setHeader("Content-Type",req.url==="/qa.js"?"text/javascript":req.url==="/qa.css"?"text/css":"text/html");
  res.end(asset);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const profile = await mkdtemp(path.join(tmpdir(),"hub-progress-qa-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",["--headless=new","--disable-gpu","--remote-debugging-port=9367",`--user-data-dir=${profile}`,"--window-size=1440,1050","about:blank"],{stdio:"ignore",windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  let ready = false;
  for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:9367/json/version")).ok){ready=true;break;}}catch{} await delay(100);}
  assert.ok(ready,"browser ready");
  const target=await (await fetch("http://127.0.0.1:9367/json/new?about:blank",{method:"PUT"})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve=>socket.addEventListener("open",resolve,{once:true}));
  let id=0; const pending=new Map(); const errors=[];
  socket.addEventListener("message",event=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const r=pending.get(msg.id);pending.delete(msg.id);msg.error?r.reject(Error(msg.error.message)):r.resolve(msg.result);}if(msg.method==="Runtime.exceptionThrown")errors.push(msg.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  const wait=async expression=>{for(let i=0;i<60;i++){if(await evaluate("Boolean(" + expression + ")"))return;await delay(100);}throw Error("wait failed: "+expression);};
  const click=async text=>{assert.ok(await evaluate(`(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===${JSON.stringify(text)});b?.click();return !!b;})()`));await delay(80);};
  const fill=async (selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event("input",{bubbles:true}));})()`);await delay(80);};
  await send("Runtime.enable");await send("Page.enable");
  await send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});
  await wait('document.querySelector(".pb-meeting")');
  assert.equal(await evaluate('document.querySelectorAll(".pb-work-grid .pb-panel").length'),2);
  assert.ok(await evaluate('document.querySelector(".pb-heading h1").textContent.endsWith("진행상황")'));
  await wait('document.querySelectorAll(".pb-schedule .g-row").length===2');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".pb-schedule .g-task-status")].map(el=>el.textContent)'),["완료","미착수"],"progress summary shares Gantt status badges");
  assert.ok(await evaluate('document.querySelector(".pb-schedule").getBoundingClientRect().top >= document.querySelector(".pb-work-grid").getBoundingClientRect().bottom'));
  assert.equal(await evaluate('document.querySelectorAll(".pb-schedule .task-workspace-tabs,.pb-schedule .schedule-filter-panel,.pb-schedule .project-issue-panel,.pb-schedule .task-schedule-create,.pb-schedule .paint").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".pb-schedule .g-new-badge").length'),1,"only tasks after reset are new");
  const painted=await evaluate('document.querySelectorAll(".pb-schedule .g-c.on").length');
  await evaluate('document.querySelector(".pb-schedule .g-c[data-gantt-task-id]").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0}));window.dispatchEvent(new PointerEvent("pointerup"));');
  assert.equal(await evaluate('document.querySelectorAll(".pb-schedule .g-c.on").length'),painted,"summary Gantt is read-only");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  if(process.env.QA_SCREENSHOT){const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(process.env.QA_SCREENSHOT,Buffer.from(shot.data,"base64"));}
  await evaluate('document.querySelector(".pb-collab-details > summary").click()');
  await click("확인 요청 올리기");
  await fill(".pb-request-form input","검토 요청");
  await fill(".pb-request-form textarea","내용 확인해주세요");
  await fill('.pb-request-form input[type="date"]',"2026-09-01");
  await evaluate("window.failWrite=true");
  await click("요청 등록");
  await wait('document.querySelector(".pb-error")');
  assert.equal(await evaluate('document.querySelector(".pb-request-form input").value'),"검토 요청");
  assert.equal(await evaluate('document.querySelector(".pb-request-form input[type=date]").value'),"2026-09-01");
  await evaluate("window.failWrite=false");
  await click("요청 등록");
  await wait('document.querySelector(".pb-request") && !document.querySelector(".pb-request-form")');
  assert.ok(await evaluate('document.querySelector(".pb-deadline").textContent.includes("기한 초과")'));
  await click("마감일 변경");
  await fill('.pb-deadline-form input',"2026-09-08");
  await evaluate('window.failWrite=true');
  await click("마감일 저장");
  await wait('document.querySelector(".pb-error")');
  assert.equal(await evaluate('document.querySelector(".pb-deadline-form input").value'),"2026-09-08");
  await evaluate('window.failWrite=false');
  await click("마감일 저장");
  await wait('!document.querySelector(".pb-deadline-form")');
  assert.ok(await evaluate('document.querySelector(".pb-deadline").textContent.includes("2026-09-08")'));
  await click("마감일 변경"); await click("기한 해제"); await click("마감일 저장");
  await wait('document.querySelector(".pb-deadline").textContent.includes("마감일 미정")');
  await click("답변 작성");
  await fill(".pb-reply-form textarea","검토 완료했습니다");
  await click("답변 저장");
  await wait('document.querySelector(".pb-replies")');
  assert.ok(await evaluate('document.querySelector(".pb-replies").textContent.includes("검토 완료했습니다")'));
  await click("확인 완료");
  await wait('!document.querySelector(".pb-request")');
  await evaluate('(()=>{const s=document.querySelector(".pb-review-toolbar select");s.value="done";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await wait('document.querySelector(".pb-request")');
  await click("다시 확인 요청");
  await wait('!document.querySelector(".pb-request")');
  await evaluate('(()=>{const s=document.querySelector(".pb-review-toolbar select");s.value="all";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await wait('document.querySelector(".pb-request")');
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  const calls=await evaluate("window.meetingCalls");
  await evaluate('window.setTestRole("client")');
  await wait('document.querySelector(".pb-empty")?.textContent.includes("회의록 조회 권한")');
  assert.equal(await evaluate("window.meetingCalls"),calls);
  assert.equal(await evaluate('document.querySelectorAll(".pb-request-actions, .pb-request-form").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".pb-deadline button,.pb-deadline-form").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".pb-schedule .otag").length'),0,"client Gantt hides executor identity");
  assert.ok(!await evaluate('document.querySelector(".progress-brief").textContent.includes("내부 논의")'));
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 390"),"populated Gantt uses inner scroll on mobile");
  await evaluate('window.setTestProject("2")');
  await wait('document.querySelectorAll(".pb-task, .pb-request").length===0');
  assert.equal(await evaluate('document.querySelectorAll(".pb-schedule .g-row").length'),0,"project switch clears Gantt rows");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(150);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 390"),"mobile overflow");
  assert.equal(errors.length,0,"runtime errors");
  console.log("PASS: live component rendering; create/reply/complete/reopen; failed-write draft; client privacy; project switch; mobile width. Test services only.");
} finally {
  socket?.close();chrome.kill();server.close();
}
