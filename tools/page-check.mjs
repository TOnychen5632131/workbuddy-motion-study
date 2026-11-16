// 通用：headless Chrome 打开本地页面，执行表达式并报告控制台异常
import { spawn } from "node:child_process";
const [url, expr] = process.argv.slice(2);
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9666;
const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=" + port, "--window-size=1280,900", url], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let page = null;
for (let i = 0; i < 30 && !page; i++) {
  await sleep(400);
  try { const list = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json(); page = list.find(t => t.type === "page"); } catch {}
}
if (!page) { console.log("NO PAGE"); child.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
};
const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
await sleep(1800);
const r = await send("Runtime.evaluate", { expression: expr || "1", returnByValue: true, awaitPromise: true });
console.log("RESULT:", JSON.stringify(r.result?.result?.value));
console.log("ERRORS:", errors.length ? errors.slice(0, 3).join(" | ") : "none");
ws.close(); child.kill();
