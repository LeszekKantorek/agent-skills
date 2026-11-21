import {prepare} from './analyze-ast.mjs';
import {cognitive} from './cognitive.mjs';
import {halstead} from './halstead.mjs';

export {prepare};
export function analyze(parsedTree, source, fileId) {
  const prepared = prepare(parsedTree, source, fileId);
  cognitive(prepared);
  prepared.halsteadOccurrences = halstead(prepared, source);
  return prepared;
}
export const rustAnalyzer = Object.freeze({prepare, analyze});





