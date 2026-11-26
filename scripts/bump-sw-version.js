/* Har deploy par service-worker.js ka CACHE_VERSION auto-bump karta hai.
   (service-worker.js ke header comments ke OPTION A — recommended.)
   Vercel/Vite `npm run build` se pehle `prebuild` hook chalata hai ye. */
const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "..", "public", "service-worker.js");
const sw = fs.readFileSync(swPath, "utf8");
const re = /CACHE_VERSION = "v\d+[^"]*"/;

if (!re.test(sw)) {
  console.error(
    "[bump-sw] FATAL: CACHE_VERSION pattern not found in public/service-worker.js — check the quoted format."
  );
  process.exit(1);
}

const next = sw.replace(re, `CACHE_VERSION = "v${Date.now()}"`);
fs.writeFileSync(swPath, next);
console.log("[bump-sw] CACHE_VERSION ->", next.match(re)[0]);

// version.json ka buildDate bhi fresh rakho (file kahin fetch nahi hoti,
// par stale date galat hai). postbuild is file ko bhi revert karta hai.
try {
  const vPath = path.join(__dirname, "..", "public", "version.json");
  const v = JSON.parse(fs.readFileSync(vPath, "utf8"));
  v.buildDate = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(vPath, JSON.stringify(v, null, 2) + "\n");
  console.log("[bump-sw] version.json buildDate ->", v.buildDate);
} catch (e) { console.error("[bump-sw] version.json update failed:", e.message); }
