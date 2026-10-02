// Empacota extension/ num .zip (para a Chrome Web Store ou para instalar em outra máquina).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createZip } from '../extension/lib/zip.js';

const root = 'extension';
const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push({ name: relative(root, p).split('\\').join('/'), data: new Uint8Array(readFileSync(p)) });
  }
};
walk(root);
mkdirSync('dist', { recursive: true });
const out = join('dist', `decalque-${version}.zip`);
writeFileSync(out, Buffer.from(await createZip(files).arrayBuffer()));
console.log(`${out} (${files.length} arquivos)`);
