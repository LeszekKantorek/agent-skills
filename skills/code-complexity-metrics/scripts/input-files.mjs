import { readdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';

function segmentExpression(segment) {
  let source = '^';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') source += '.*';
    else if (c === '?') source += '.';
    else if (c === '[') {
      const end = segment.indexOf(']', i + 1);
      if (end < 0) source += '\\[';
      else { let group = segment.slice(i + 1, end); if (group.startsWith('!')) group = '^' + group.slice(1); source += '[' + group + ']'; i = end; }
    } else source += c.replace(/[\\^$+.()|{}]/g, '\\$&');
  }
  return new RegExp(source + '$');
}

export async function inputFiles(patterns, cwd = process.cwd()) {
  const files = new Set();
  patterns = patterns.flatMap(function expand(pattern) {
    const match = /\{([^{}]*,[^{}]*)\}/.exec(pattern);
    return match ? match[1].split(',').flatMap(part => expand(pattern.slice(0, match.index) + part + pattern.slice(match.index + match[0].length))) : [pattern];
  });
  for (const pattern of patterns) {
    if (!/[?*\[]/.test(pattern)) { files.add(path.resolve(cwd, pattern)); continue; }
    const absolute = path.resolve(cwd, pattern);
    const root = path.parse(absolute).root;
    const parts = absolute.slice(root.length).split(path.sep);
    async function walk(dir, index, ancestors) {
      if (index === parts.length) {
        try { if ((await stat(dir)).isFile()) files.add(path.resolve(dir)); } catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) throw e; }
        return;
      }
      const part = parts[index];
      if (part === '**') {
        await walk(dir, index + 1, ancestors);
        let entries;
        try { entries = await readdir(dir, { withFileTypes: true }); } catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) return; throw e; }
        let identity;
        try { identity = await realpath(dir); } catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) return; throw e; }
        if (ancestors.has(identity)) return;
        const next = new Set(ancestors); next.add(identity);
        for (const entry of entries) {
          const child = path.join(dir, entry.name);
          let directory = entry.isDirectory();
          if (entry.isSymbolicLink()) {
            try { directory = (await stat(child)).isDirectory(); } catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) throw e; }
          }
          if (directory) await walk(child, index, next);
          else if (index === parts.length - 1) await walk(child, index + 1, next);
        }
      } else if (/[?*\[]/.test(part)) {
        let entries;
        try { entries = await readdir(dir, { withFileTypes: true }); } catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) return; throw e; }
        const match = segmentExpression(part);
        for (const entry of entries) if (match.test(entry.name)) await walk(path.join(dir, entry.name), index + 1, ancestors);
      } else await walk(path.join(dir, part), index + 1, ancestors);
    }
    await walk(root, 0, new Set());
  }
  const sorted=[...files].sort((a, b) => { const x = a.replaceAll('\\', '/'), y = b.replaceAll('\\', '/'); return x < y ? -1 : x > y ? 1 : 0; });
  const seen=new Map(), result=[];
  for (const file of sorted) {
    let identity;
    try { identity=await realpath(file); } catch { identity=file; }
    const canonical=identity;
    if (process.platform==='win32') identity=identity.toLowerCase();
    if (!seen.has(identity)) { seen.set(identity,result.length); result.push(file); }
    else {
      const rank = candidate => path.basename(candidate)===path.basename(canonical) ? 2 : path.extname(candidate)===path.extname(canonical) ? 1 : 0;
      const index=seen.get(identity);
      if (rank(file)>rank(result[index])) result[index]=file;
    }
  }
  return result.sort((a,b)=>{const x=a.replaceAll('\\','/'),y=b.replaceAll('\\','/');return x<y?-1:x>y?1:0});
}
export function languageFor(file) {
  return ({ '.rs': 'rust', '.js': 'javascript' })[path.extname(file)] ?? null;
}
