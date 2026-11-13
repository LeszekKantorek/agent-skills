import { rustAnalyzer } from './rust/analyze.mjs';
import { javascriptAnalyzer } from './javascript/analyze.mjs';

const analyzers = new Map([['rust', rustAnalyzer], ['javascript', javascriptAnalyzer]]);
/** Select once per file; subsequent work belongs to the selected analyzer. */
export function analyzerFor(language) {
  const analyzer = analyzers.get(language);
  if (!analyzer) throw new Error(`Unsupported language: ${language}`);
  return analyzer;
}
