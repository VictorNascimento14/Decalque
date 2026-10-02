import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, createZip } from '../../extension/lib/zip.js';

test('crc32 bate com o valor conhecido', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('createZip gera um ZIP que o unzip aceita', async () => {
  const bin = new Uint8Array(70000).map((_, i) => (i * 31) % 256);
  const blob = createZip([
    { name: 'DESIGN.md', data: '# Olá, ação!\n' },
    { name: 'assets/images/foto.bin', data: bin },
    { name: 'pasta vazia/arquivo com espaço.txt', data: '' },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'decalque-zip-'));
  const file = join(dir, 'kit.zip');
  writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  const test = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(test, /No errors detected/);
  assert.equal(execFileSync('unzip', ['-p', file, 'DESIGN.md'], { encoding: 'utf8' }), '# Olá, ação!\n');
  const back = execFileSync('unzip', ['-p', file, 'assets/images/foto.bin']);
  assert.deepEqual(new Uint8Array(back), bin);
});

test('createZip recusa nomes repetidos', () => {
  assert.throws(() => createZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }]), /repetido/);
});
