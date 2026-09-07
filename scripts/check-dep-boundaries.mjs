/**
 * Lightweight circular-import heuristic for key layers.
 * Fails if domain/model import from components or React;
 * fails if model imports domain (direction must be domain → model).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const offenders = [];

function walk(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fn);
    else if (/\.(ts|tsx)$/.test(entry.name)) fn(full);
  }
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, "/");
}

walk(path.join(root, "lib"), (file) => {
  const r = rel(file);
  const src = fs.readFileSync(file, "utf8");
  if (r.startsWith("lib/model/") || r === "lib/model.ts") {
    if (/from ["']react["']/.test(src) || /from ["']@\/components/.test(src))
      offenders.push(`${r} imports React/components`);
    if (/from ["'].*domain/.test(src) || /from ["']@\/lib\/domain/.test(src))
      offenders.push(`${r} imports domain (must be domain → model only)`);
    if (/from ["'].*server/.test(src) && !r.includes("noop"))
      offenders.push(`${r} imports server`);
  }
  if (r.startsWith("lib/domain/")) {
    if (/from ["']react["']/.test(src) || /from ["']@\/components/.test(src))
      offenders.push(`${r} imports React/components`);
    if (
      /from ["']@\/lib\/supabase/.test(src) ||
      /from ["'].*supabase-browser/.test(src) ||
      /from ["']next\//.test(src)
    )
      offenders.push(`${r} imports browser/next/supabase`);
    if (/\b(window|document|localStorage)\./.test(src))
      offenders.push(`${r} uses browser globals`);
    if (/fetch\(/.test(src)) offenders.push(`${r} uses fetch`);
  }
});

if (offenders.length) {
  console.error("Dependency boundary violations:");
  for (const o of offenders) console.error(" -", o);
  process.exit(1);
}
console.log("Dependency boundaries OK (heuristic)");
