// "lint" mínimo: confere a sintaxe de todo .js da extensão, dos testes e dos scripts, e se o manifest é JSON válido.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['extension', 'test', 'scripts'];
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(name)) files.push(p);
  }
};
roots.filter((r) => existsSync(r)).forEach(walk);
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.error(`✗ ${f}\n${String(e.stderr).split('\n').slice(0, 6).join('\n')}`);
  }
}
let total = files.length;
if (existsSync('extension/manifest.json')) {
  total++;
  try {
    const m = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
    if (m.manifest_version !== 3) throw new Error('manifest_version precisa ser 3');
  } catch (e) {
    bad++;
    console.error(`✗ extension/manifest.json: ${e.message}`);
  }
}
console.log(`${total - bad}/${total} arquivos ok`);
process.exit(bad ? 1 : 0);
