// Renders icons/icon.svg to the PNG sizes the web manifest needs. Dev tool: needs Playwright (any Chromium).
//   node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright'); // CommonJS resolution honours NODE_PATH
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons', 'icon.svg'), 'utf8');
const browser = await chromium.launch();
async function render(file, size, padding = 0, bg = 'transparent') {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const inner = size - padding * 2;
  await page.setContent(`<style>html,body{margin:0;background:${bg}}body{width:${size}px;height:${size}px;display:grid;place-items:center}svg{width:${inner}px;height:${inner}px}</style>${svg}`);
  await page.screenshot({ path: join(root, 'icons', file), omitBackground: bg === 'transparent' });
  await page.close();
}
await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, 64, '#0c1311'); // maskable: safe zone padding on a solid background
await browser.close();
console.log('icons written');
