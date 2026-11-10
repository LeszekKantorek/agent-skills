import ts from '../vendor/tree-sitter/tree-sitter.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = fileURLToPath(new URL('../vendor/tree-sitter/', import.meta.url));
await ts.Parser.init({ locateFile: name => path.join(dir, name) });
const languages = new Map();
export async function parse(source, language) {
  if (!['rust', 'javascript'].includes(language)) throw new Error('Unsupported language');
  if (!languages.has(language)) languages.set(language, await ts.Language.load(path.join(dir, `tree-sitter-${language}.wasm`)));
  const parser = new ts.Parser();
  parser.setLanguage(languages.get(language));
  const tree = parser.parse(source);
  return { tree, dispose() { tree.delete(); parser.delete(); } };
}
