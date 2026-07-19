// Rasterize an SVG to PNG at a given size using Playwright chromium.
// Usage: node scripts/render-svg.mjs <in.svg> <out.png> <size>
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [svgPath, outPath, sizeArg] = process.argv.slice(2);
const size = parseInt(sizeArg || '1024', 10);
const svg = readFileSync(resolve(svgPath), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: size, height: size } });
await page.setContent(
  `<!doctype html><style>*{margin:0}body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
);
await page.screenshot({ path: resolve(outPath), omitBackground: true });
await browser.close();
console.log(`rendered ${svgPath} -> ${outPath} @ ${size}`);
