import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(homedir(), 'workspace/tools/playwright-lab/package.json'));
const { chromium } = require('playwright');
const canvasSize = 1024;
const imageUrl = new URL('./entry.png', import.meta.url);
const browser = await chromium.launch({ headless: true, channel: 'chromium' });

try {
  const page = await browser.newPage({
    viewport: { width: canvasSize, height: canvasSize },
    deviceScaleFactor: 1,
  });
  await page.goto(new URL('./news.html', import.meta.url).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(imageUrl), type: 'png' });

  const png = await readFile(imageUrl);
  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Screenshot does not have a valid PNG header');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  console.log(`entry.png: ${png.length} bytes, ${width}×${height}`);
  if (png.length > 1048576 || width !== canvasSize || height !== canvasSize) {
    throw new Error(`PNG validation failed: ${png.length} bytes, ${width}×${height}; maximum 1048576 bytes, required 1024×1024`);
  }

  const problems = await page.evaluate((limit) => {
    const issues = [];
    const describe = (element) => {
      const classes = [...element.classList].map((name) => `.${name}`).join('');
      const text = element.textContent.trim().replace(/\s+/g, ' ').slice(0, 70);
      return `${element.tagName.toLowerCase()}${classes} (${text})`;
    };

    for (const element of document.querySelectorAll('.story, .masthead, .markets, footer')) {
      const label = describe(element);
      const box = element.getBoundingClientRect();
      if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
        issues.push(`${label}: scroll size exceeds client size`);
      }
      if (box.left < 0 || box.top < 0 || box.right > limit || box.bottom > limit) {
        issues.push(`${label}: extends beyond the ${limit}px canvas`);
      }
      for (const child of element.querySelectorAll('h2, p, .date, .subline')) {
        const bounds = child.getBoundingClientRect();
        if (bounds.left < box.left || bounds.top < box.top || bounds.right > box.right || bounds.bottom > box.bottom) {
          issues.push(`${label}: descendant ${describe(child)} extends beyond its box`);
        }
      }
    }

    for (const [contentSelector, boundarySelector] of [
      ['.grid .story h2, .grid .story p', '.markets'],
      ['.leads .story h2, .leads .story p', '.grid'],
    ]) {
      const boundary = document.querySelector(boundarySelector);
      if (!boundary) continue;
      const top = boundary.getBoundingClientRect().top;
      for (const element of document.querySelectorAll(contentSelector)) {
        if (element.getBoundingClientRect().bottom > top) {
          issues.push(`${describe(element)}: spills past the top of ${boundarySelector}`);
        }
      }
    }
    return issues;
  }, canvasSize);

  if (problems.length > 0) {
    throw new Error(`Layout validation failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  }
  console.log('Layout verified');
} finally {
  await browser.close();
}
