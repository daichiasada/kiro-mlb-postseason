#!/usr/bin/env node
// Render every docs/video/slides/*.svg to a same-named PNG under docs/video/
// at 1920x1080 (16:9).
//
// Render path: sharp (libvips + librsvg/fontconfig). The system has
// "Noto Sans JP" installed and registered with fontconfig, so Japanese
// glyphs rasterize correctly when the SVG uses
// font-family="'Noto Sans JP', sans-serif".
//
// Reproduce:
//   npm i -D sharp   # once, from the repo root
//   node scripts/render-slides.mjs
//
// If sharp cannot be loaded or fails to render, this script exits non-zero;
// the documented fallback is to render each SVG via the already-installed
// Playwright chromium (load the SVG in a 1920x1080 page and page.screenshot).

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WIDTH = 1920;
const HEIGHT = 1080;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slidesDir = path.join(repoRoot, "docs", "video", "slides");
const outDir = path.join(repoRoot, "docs", "video");

async function main() {
  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch (err) {
    console.error(
      "Could not load 'sharp'. Install it with `npm i -D sharp` from the repo root, " +
        "or render the SVGs via Playwright chromium as documented in scripts/render-slides.mjs."
    );
    throw err;
  }

  await mkdir(outDir, { recursive: true });

  const entries = (await readdir(slidesDir))
    .filter((name) => name.toLowerCase().endsWith(".svg"))
    .sort();

  if (entries.length === 0) {
    throw new Error(`No .svg files found in ${slidesDir}`);
  }

  for (const name of entries) {
    const svgPath = path.join(slidesDir, name);
    const pngName = name.replace(/\.svg$/i, ".png");
    const pngPath = path.join(outDir, pngName);
    const svg = await readFile(svgPath);

    await sharp(svg, { density: 96 })
      .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 11, g: 18, b: 32, alpha: 1 } })
      .png()
      .toFile(pngPath);

    console.log(`rendered ${name} -> docs/video/${pngName}`);
  }

  console.log(`\nDone. ${entries.length} slide(s) rendered to docs/video/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
