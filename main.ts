import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const source = new URL('./entry.png', import.meta.url);
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

await mkdir(outputDirectory, { recursive: true });
const destination = join(outputDirectory, 'entry.png');
await copyFile(source, destination);
const [sourceBytes, copiedBytes] = await Promise.all([
  readFile(source),
  readFile(destination),
]);
if (!sourceBytes.equals(copiedBytes)) {
  console.error('Error: copy differs from the source');
  process.exitCode = 1;
}
const { size } = await stat(destination);
console.log(`Copied entry.png: ${size} bytes`);
const digest = createHash('sha256').update(copiedBytes).digest('hex');
console.log(`SHA-256: ${digest}`);
