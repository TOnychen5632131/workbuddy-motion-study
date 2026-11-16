// Minimal CDP client for the WorkBuddy Electron renderer (Node >=22 global WebSocket).
const ENDPOINT = process.env.WB_CDP || "http://127.0.0.1:9222";

async function pickTarget() {
  const list = await (await fetch(ENDPOINT + "/json/list")).json();
  const pages = list.filter(t => t.type === "page");
  const page = pages.find(t => /index\.html/.test(t.url)) || pages[0];
  if (!page) throw new Error("no page target");
  return page;
}

async function connect() {
  const t = await pickTarget();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { ws, send, target: t };
}

async function evaluate(send, expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}

const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === "targets") {
  console.log(JSON.stringify(await (await fetch(ENDPOINT + "/json/list")).json(), null, 1));
  process.exit(0);
}

const { ws, send, target } = await connect();
await send("Runtime.enable");
await send("Page.enable").catch(() => {});
try {
  if (cmd === "text") {
    console.log(await evaluate(send, "document.body.innerText"));
  } else if (cmd === "eval") {
    const v = await evaluate(send, arg);
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
  } else if (cmd === "evalfile") {
    const fs = await import("node:fs");
    const v = await evaluate(send, fs.readFileSync(arg, "utf8"));
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
  } else if (cmd === "shot") {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const fs = await import("node:fs");
    fs.mkdirSync((await import("node:path")).dirname(arg), { recursive: true });
    fs.writeFileSync(arg, Buffer.from(r.data, "base64"));
    console.log("saved " + arg);
  } else if (cmd === "anims") {
    const expr = "(() => { const out = []; for (const a of document.getAnimations()) { const e = a.effect; const t = e && e.getTiming ? e.getTiming() : {}; const kf = e && e.getKeyframes ? e.getKeyframes() : []; const tg = e && e.target; out.push({ id: a.animationName || a.transitionProperty || a.id || '(anon)', kind: a.constructor.name, target: tg ? tg.tagName + (tg.className && typeof tg.className === 'string' ? '.' + tg.className.slice(0, 80) : '') : null, playState: a.playState, duration: t.duration, delay: t.delay, easing: t.easing, iterations: t.iterations, fill: t.fill, keyframes: kf.slice(0, 10) }); } return out; })()";
    console.log(JSON.stringify(await evaluate(send, expr), null, 1));
  } else if (cmd === "sheets") {
    const expr = "(() => { const r = []; for (const s of document.styleSheets) { r.push({ href: s.href, rules: (() => { try { return s.cssRules ? s.cssRules.length : -1; } catch (e) { return 'blocked'; } })() }); } return r; })()";
    console.log(JSON.stringify(await evaluate(send, expr), null, 1));
  } else if (cmd === "keyframes") {
    const expr = "(() => { const out = []; const walk = (rs) => { for (const r of rs) { if (r.type === 7) out.push({ name: r.name, css: r.cssText }); else if (r.cssRules) walk(r.cssRules); } }; for (const s of document.styleSheets) { try { if (s.cssRules) walk(s.cssRules); } catch (e) {} } return out; })()";
    console.log(JSON.stringify(await evaluate(send, expr), null, 1));
  } else if (cmd === "anim-css") {
    const expr = "(() => { const out = []; const walk = (rs, media) => { for (const r of rs) { if (r.cssRules) walk(r.cssRules, r.conditionText || media); else if (r.cssText && /(^|[; ])(animation|transition)[-:]/.test(r.cssText)) out.push({ media: media || null, selector: r.selectorText || null, css: r.cssText.slice(0, 500) }); } }; for (const s of document.styleSheets) { try { if (s.cssRules) walk(s.cssRules, null); } catch (e) {} } return out; })()";
    console.log(JSON.stringify(await evaluate(send, expr), null, 1));
  } else if (cmd === "click") {
    const expr = "(() => { const el = document.querySelector(" + JSON.stringify(arg) + "); if (!el) return 'NOT FOUND: ' + " + JSON.stringify(arg) + "; el.click(); return 'clicked: ' + el.tagName + '.' + el.className; })()";
    console.log(await evaluate(send, expr));
  } else if (cmd === "tree") {
    const expr = "(() => { const pick = (el, d) => { if (d > 4) return null; const kids = [...el.children].slice(0, 12).map(c => pick(c, d + 1)).filter(Boolean); return { tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '', id: el.id || undefined, text: el.children.length === 0 ? (el.textContent || '').trim().slice(0, 80) : undefined, kids: kids.length ? kids : undefined }; }; return pick(document.body, 0); })()";
    console.log(JSON.stringify(await evaluate(send, expr), null, 1));
  } else {
    console.log("usage: cdp.mjs <targets|text|eval|evalfile|shot|anims|sheets|keyframes|anim-css|click|tree> [arg]");
  }
} finally {
  ws.close();
}
