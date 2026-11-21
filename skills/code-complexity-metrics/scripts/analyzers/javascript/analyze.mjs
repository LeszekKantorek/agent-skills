import {prepare} from './analyze-ast.mjs';
import {cognitive} from './cognitive.mjs';
export function analyze(parsedTree, source, fileId) {
 const prepared = prepare(parsedTree, source, fileId);
 cognitive(prepared);
 return prepared;
}
export const javascriptAnalyzer = Object.freeze({prepare, analyze});
