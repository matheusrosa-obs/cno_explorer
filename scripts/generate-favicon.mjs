import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pngToIco from "png-to-ico";
import { PNG } from "pngjs";

const projectRoot = process.cwd();
const sourcePng = path.join(projectRoot, "public", "logo_dark.png");

const srcBuffer = await fs.readFile(sourcePng);
const srcPng = PNG.sync.read(srcBuffer);

const size = Math.max(srcPng.width, srcPng.height);
const square = new PNG({ width: size, height: size, colorType: 6 });

// Default is transparent; center original without scaling.
const dx = Math.floor((size - srcPng.width) / 2);
const dy = Math.floor((size - srcPng.height) / 2);
PNG.bitblt(srcPng, square, 0, 0, srcPng.width, srcPng.height, dx, dy);

const tmpSquarePng = path.join(os.tmpdir(), `logo_dark_square_${Date.now()}.png`);
await fs.writeFile(tmpSquarePng, PNG.sync.write(square));

const icoBuffer = await pngToIco(tmpSquarePng);

await fs.rm(tmpSquarePng, { force: true });

await fs.writeFile(path.join(projectRoot, "public", "favicon.ico"), icoBuffer);
await fs.writeFile(path.join(projectRoot, "app", "favicon.ico"), icoBuffer);

console.log("Generated public/favicon.ico and app/favicon.ico from public/logo_dark.png");
