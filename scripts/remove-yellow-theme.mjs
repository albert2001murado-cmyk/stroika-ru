import fs from "fs";
import path from "path";

const root = process.cwd();
const targetDirs = ["src"];
const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

const replacements = [
  ["#ffde3d", "#ffffff"],
  ["#FFDE3D", "#ffffff"],
  ["bg-[#ffde3d]", "bg-white"],
  ["text-[#ffde3d]", "text-white"],
  ["border-[#ffde3d]", "border-white"],
  ["from-[#ffde3d]", "from-white"],
  ["to-[#ffde3d]", "to-white"],
  ["via-[#ffde3d]", "via-blue-100"],
  ["shadow-yellow-500/20", "shadow-blue-500/20"],
  ["shadow-yellow-500/30", "shadow-blue-500/20"],
  ["hover:bg-yellow-300", "hover:bg-blue-50"],
  ["hover:bg-yellow-400", "hover:bg-blue-50"],
  ["bg-yellow-50", "bg-blue-50"],
  ["bg-yellow-100", "bg-blue-50"],
  ["bg-yellow-200", "bg-blue-100"],
  ["bg-yellow-300", "bg-blue-100"],
  ["bg-yellow-400", "bg-blue-100"],
  ["bg-yellow-500", "bg-[#0057ff]"],
  ["text-yellow-400", "text-blue-500"],
  ["text-yellow-500", "text-blue-600"],
  ["text-yellow-600", "text-blue-700"],
  ["text-yellow-700", "text-blue-800"],
  ["border-yellow-100", "border-blue-100"],
  ["border-yellow-200", "border-blue-100"],
  ["fill-yellow-400", "fill-blue-500"],
  ["fill-yellow-500", "fill-blue-500"],
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const items = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const item of items) {
    const full = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(item.name)) continue;
      files.push(...walk(full));
    } else if (exts.has(path.extname(item.name))) {
      files.push(full);
    }
  }

  return files;
}

let changed = 0;

for (const dir of targetDirs) {
  for (const file of walk(path.join(root, dir))) {
    let text = fs.readFileSync(file, "utf8");
    const before = text;

    for (const [from, to] of replacements) {
      text = text.split(from).join(to);
    }

    text = text
      .replace(/bg-yellow-\d+/g, "bg-blue-50")
      .replace(/text-yellow-\d+/g, "text-blue-600")
      .replace(/border-yellow-\d+/g, "border-blue-100")
      .replace(/fill-yellow-\d+/g, "fill-blue-500")
      .replace(/shadow-yellow-[^\s"']+/g, "shadow-blue-500/20");

    if (text !== before) {
      fs.writeFileSync(file, text, "utf8");
      console.log("updated", path.relative(root, file));
      changed += 1;
    }
  }
}

console.log(`Done. Changed files: ${changed}`);
