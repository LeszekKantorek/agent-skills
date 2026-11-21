import {prepare} from './analyze-ast.mjs';
import {cognitive} from './cognitive.mjs';
import {halstead} from './halstead.mjs';
export function analyze(parsedTree, source, fileId) {
 const prepared = prepare(parsedTree, source, fileId);
 cognitive(prepared);
 prepared.halsteadOccurrences = halstead(prepared, source);
 return prepared;
}
export const javascriptAnalyzer = Object.freeze({prepare, analyze});
