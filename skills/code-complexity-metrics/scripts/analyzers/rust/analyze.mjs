import {prepare} from './analyze-ast.mjs';
import {cognitive} from './cognitive.mjs';
import {cyclomatic} from './cyclomatic.mjs';
import {statements} from './statements.mjs';

export {prepare};
export function analyze(parsedTree, source, fileId) {
  const prepared = prepare(parsedTree, source, fileId);
  cognitive(prepared); cyclomatic(prepared); statements(prepared, source);
  return prepared;
}
export const rustAnalyzer = Object.freeze({prepare, analyze});





