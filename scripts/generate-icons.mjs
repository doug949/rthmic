/**
 * Generates PNG app icons using Canvas.
 * Run: node scripts/generate-icons.mjs
 */
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../public/icons");
mkdirSync(iconsDir, { recursive: true });

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size, size);

  // Letter R — centered
  const fontSize = Math.round(size * 0.48);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("R", size / 2, size / 2 + size * 0.02);

  return canvas.toBuffer("image/png");
}

const sizes = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png" },
];

for (const { size, name } of sizes) {
  const buf = createIcon(size);
  const outPath = join(iconsDir, name);
  writeFileSync(outPath, buf);
  console.log(`✓ ${name} (${size}x${size})`);
}
