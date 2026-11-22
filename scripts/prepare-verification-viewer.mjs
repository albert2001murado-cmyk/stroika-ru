import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/pdfjs-dist");
const destination = join(root, "public/verification-viewer");
mkdirSync(destination, { recursive: true });
for (const [sourceName, destinationName] of [["pdf.min.mjs", "pdf.mjs"], ["pdf.worker.min.mjs", "pdf.worker.mjs"]]) cpSync(join(source, "legacy/build", sourceName), join(destination, destinationName));
for (const name of ["cmaps", "standard_fonts", "wasm"]) cpSync(join(source, name), join(destination, name), { recursive: true });
