import { spawn } from "node:child_process";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "file:///C:/Users/zhongwen_guan/Desktop/%E9%80%86%E5%90%91%E5%B7%A5%E7%A8%8B%20REA/workbuddy/demo/index.html";
const port = 9555;
const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=" + port,
  "--window-size=1280,860", URL], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let page = null;
for (let i = 0; i < 30 && !page; i++) {
  await sleep(400);
  try {
    const list = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
    page = list.find(t => t.type === "page");
  } catch {}
}
if (!page) { console.log("NO PAGE"); child.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description || ""));
});
await send("Runtime.enable");
await sleep(2500);
console.log("T0:", JSON.stringify(await evalJs("(()=>({msgs:document.querySelectorAll('.msg').length,bubbles:document.querySelectorAll('.bubble').length,text:document.body.innerText.slice(0,80)}))()")));
await evalJs("document.getElementById('replay').click()");
await sleep(2600);
console.log("T1:", JSON.stringify(await evalJs("(()=>({msgs:document.querySelectorAll('.msg').length,cards:document.querySelectorAll('.tool-card').length,tips:document.querySelectorAll('.loading-tip').length,shining:document.querySelectorAll('.wb-shining').length,caret:document.querySelectorAll('.caret').length}))()")));
await sleep(4000);
console.log("T2:", JSON.stringify(await evalJs("(()=>({cards:document.querySelectorAll('.tool-card').length,done:document.querySelectorAll('.tool-card.done').length,chip:document.querySelector('.tool-card__title')?.textContent||'',theme:document.documentElement.dataset.theme}))()")));
await evalJs("document.getElementById('theme').click()");
console.log("THEME:", await evalJs("document.documentElement.dataset.theme"));
console.log("ERRORS:", errors.length ? errors.slice(0, 3).join(" | ") : "none");
ws.close(); child.kill();
