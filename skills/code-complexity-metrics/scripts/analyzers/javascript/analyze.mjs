import {prepare} from './analyze-ast.mjs';
import {cognitive} from './cognitive.mjs';
import {cyclomatic} from './cyclomatic.mjs';
import {statements} from './statements.mjs';
export function analyze(parsedTree, source, fileId) {
 const p=prepare(parsedTree,source,fileId);
 cognitive(p); cyclomatic(p); statements(p);
 return p;
}
export const javascriptAnalyzer = Object.freeze({prepare, analyze});
