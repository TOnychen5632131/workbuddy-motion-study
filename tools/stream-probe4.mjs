// 精确测量 WorkBuddy 一轮问答的节奏：点击 → 思考 → 首字 → 流式速率 → 完成
import fs from "node:fs";
const ENDPOINT = "http://127.0.0.1:9222";
const list = await (await fetch(ENDPOINT + "/json/list")).json();
const page = list.find(t => t.type === "page" && /index\.html/.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await send("Runtime.enable");

const probe = "(()=>{const d=document.querySelector('.cr-document');return {len:d?d.innerText.trim().length:0,think:!!document.querySelector('[class*=cb-shining-text],[class*=loadingText],[class*=loadingMessage]'),tools:document.querySelectorAll('[class*=compact]').length,stop:!!document.querySelector('[class*=stop]')}})()";
const base = await ev(probe);
await ev("(()=>{const ed=document.querySelector('[contenteditable=true]');ed.focus();const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);return 1})()");
await send("Input.insertText", { text: "用一句话介绍你自己" });
await sleep(400);
const ready = await ev("document.querySelector('.cr-send-button').className.indexOf('disabled')<0");
console.log("ready:", ready, "baseLen:", base.len);
const t0 = Date.now();
await ev("(()=>{document.querySelector('.cr-send-button').click();return 1})()");
const rows = [];
let stable = 0;
for (let i = 0; i < 400; i++) {
  await sleep(100);
  const s = await ev(probe);
  rows.push({ t: Date.now() - t0, len: s.len, think: s.think, tools: s.tools, stop: s.stop });
  const n = rows.length;
  if (n > 2 && rows[n-1].len === rows[n-2].len) stable++; else stable = 0;
  if (n > 40 && stable > 25) break;
}
fs.writeFileSync("C:/Users/zhongwen_guan/Desktop/逆向工程 REA/workbuddy/analysis/runtime/stream-timeline.json", JSON.stringify(rows));
const grew = rows.filter((r, i) => i > 0 && r.len > rows[i-1].len);
const firstGrow = grew[0];
const maxLen = Math.max(...rows.map(r => r.len));
const thinkRows = rows.filter(r => r.think);
const last = rows[rows.length-1];
console.log("samples:", rows.length, "durationMs:", last.t, "finalLen:", maxLen, "delta:", maxLen - base.len);
if (firstGrow) {
  const growthEnd = grew[grew.length-1];
  const secs = (growthEnd.t - firstGrow.t) / 1000;
  console.log("firstTokenMs:", firstGrow.t, "growthEndMs:", growthEnd.t, "charsPerSec:", secs > 0 ? ((growthEnd.len - firstGrow.len) / secs).toFixed(1) : "n/a");
  console.log("thinkMs:", thinkRows.length ? (thinkRows[thinkRows.length-1].t - thinkRows[0].t) : 0);
  console.log("curve:", rows.filter((r, i) => i % 10 === 0).map(r => r.t + ":" + (r.len - base.len)).join(" "));
} else console.log("no growth captured");
ws.close();
