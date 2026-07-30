import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceSvg = process.argv[2];

if (!sourceSvg) {
  throw new Error("Usage: node scripts/extract-brand-logo.mjs <page-7.svg>");
}

const page = await readFile(sourceSvg, "utf8");
const artwork = page.indexOf("</defs>");
const start = page.indexOf("<path ", artwork);
const end = page.indexOf('<g fill="rgb(100%, 100%, 100%)"', start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate the primary logo vector paths.");
}

const paths = page.slice(start, end).trim();
const outputDirectory = resolve(root, "public/branding");
await mkdir(outputDirectory, { recursive: true });
await copyFile(
  resolve(outputDirectory, "hyfit-games-logo.png"),
  resolve(outputDirectory, "hyfit-games-logo-legacy.png"),
);

const makeSvg = (colour) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="620 300 680 475" role="img" aria-labelledby="title">
  <title id="title">HYFIT Games</title>
  <g style="color:${colour}">
${paths.replaceAll('fill="rgb(100%, 100%, 100%)"', 'fill="currentColor"')}
  </g>
</svg>
`;

await writeFile(
  resolve(outputDirectory, "hyfit-games-2026-white.svg"),
  makeSvg("#ffffff"),
);
await writeFile(
  resolve(outputDirectory, "hyfit-games-2026-dark.svg"),
  makeSvg("#121410"),
);

console.log("Extracted HYFIT Games 2026 white and dark vector marks.");
