// Extract CSS rules/keyframes from minified stylesheets by selector regex.
import fs from "node:fs";

const [file, pattern, mode] = process.argv.slice(2);
if (!file || !pattern) {
  console.log("usage: css-extract.mjs <css-file> <regex> [--keyframes|--decl]");
  process.exit(1);
}
const text = fs.readFileSync(file, "utf8");
const re = new RegExp(pattern, "i");

function splitTop(css) {
  // split into top-level blocks: selector { body } and at-rules with nested blocks
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    let depth = 0, j = open, end = -1;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) break;
    out.push({ head: css.slice(i, open).trim(), body: css.slice(open + 1, end) });
    i = end + 1;
  }
  return out;
}

const blocks = splitTop(text);
const results = [];
const walk = (list) => {
  for (const b of list) {
    if (/^@(media|supports|layer|container)/.test(b.head)) { walk(splitTop(b.body)); continue; }
    if (re.test(b.head)) results.push(b);
  }
};
walk(blocks);

if (mode === "--keyframes") {
  for (const r of results) {
    console.log("@@ " + r.head);
    console.log(r.body.trim().replace(/\}\s*/g, "}\n").slice(0, 1200));
    console.log("");
  }
} else {
  for (const r of results) {
    console.log("@@ " + r.head);
    console.log(r.body.split(";").map(s => s.trim()).filter(Boolean).map(s => "   " + s + ";").join("\n").slice(0, 1600));
    console.log("");
  }
}
console.log("== matched " + results.length + " rule(s) in " + file.split(/[\\/]/).pop() + " for /" + pattern + "/");
