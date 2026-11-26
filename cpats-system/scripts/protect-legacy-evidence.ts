import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evidenceRoot, safeEvidenceName } from '../src/shared/evidence';

async function main() {
  const source = path.resolve('public/uploads');
  const destination = evidenceRoot();
  const publicRoot = path.resolve('public');
  const relative = path.relative(publicRoot, destination);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Evidence storage must be outside public.');
  const files = await readdir(source, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
  for (const file of files) if (!file.isFile() || !safeEvidenceName(file.name)) throw new Error('Review unsupported legacy entries before migration.');
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ files: files.length, apply: false, destination })); return; }
  await mkdir(destination, { recursive: true });
  const backup = path.join(destination, 'legacy-backup', randomUUID());
  await mkdir(backup, { recursive: true });
  const manifest = [];
  // Copy and verify every file before removing any public entry.
  for (const file of files) {
    const bytes = await readFile(path.join(source, file.name));
    const target = path.join(destination, file.name);
    try { await writeFile(target, bytes, { flag: 'wx' }); }
    catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error; }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (createHash('sha256').update(await readFile(target)).digest('hex') !== hash) throw new Error('Protected copy differs from legacy source. No public entries were moved.');
    manifest.push({ name: file.name, bytes: bytes.length, sha256: hash });
  }
  await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  for (const file of files) {
    const from = path.resolve(source, file.name), to = path.resolve(backup, file.name);
    if (path.dirname(from) !== source || path.dirname(to) !== backup) throw new Error('Migration path escaped its intended directory.');
    await rename(from, to);
  }
  console.log(JSON.stringify({ files: files.length, apply: true, destination, backup }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Evidence migration failed.'); process.exitCode = 1; });
