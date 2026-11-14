/**
 * Analyze AST and language analyzer contract (plan step 1).
 *
 * Positions and indices are UTF-16 code units in the original source; rows and
 * columns are zero-based and ends exclusive. Each node is owned by one tree.
 *
 * @typedef {{row: number, column: number}} Position
 * @typedef {{startIndex: number, endIndex: number, startPosition: Position, endPosition: Position}} Range
 * @typedef {{cognitive: number, cyclomatic: number, statements: number}} Score
 * @typedef {{type: string, field: string|null, isNamed: boolean, startPosition: Position, endPosition: Position, startIndex: number, endIndex: number, children: AnalyzeNode[], score: Score}} AnalyzeNode
 * @typedef {string} OuterId
 * @typedef {{id: OuterId, name: string|null, root: AnalyzeNode}} ReportedFunction
 * @typedef {{code: string, category: 'input'|'parse'|'unsupported'|'internal', message: string, fileId: string, range: Range|null, owner: OuterId|null, affectedMetrics: Array<'cognitive'|'cyclomatic'|'statements'>, affectsFunctionDiscovery: boolean}} Diagnostic
 * @typedef {{comments: Range[], unsafeCommentRanges: Range[], lineAnnotations: Array<{row: number, contentEndIndex: number, endIndex: number|null}>}} Presentation
 * @typedef {{fileId: string, source: string}} SourceFile
 * @typedef {{fileId: string, source: SourceFile|null, analysis: Prepared|null, diagnostics: Diagnostic[]}} FileResult
 * @typedef {{code: string, category: 'input'|'internal', message: string, fileId: null, range: null, owner: null, affectedMetrics: Array<'cognitive'|'cyclomatic'|'statements'>, affectsFunctionDiscovery: boolean}} RunError
 * @typedef {{tree: AnalyzeNode, functions: ReportedFunction[], ownerByNode: Map<AnalyzeNode, OuterId|null>, diagnostics: Diagnostic[], presentation: Presentation}} Prepared
 * @typedef {{prepare(parsedTree: object, source: string, fileId: string): Prepared, analyze(parsedTree: object, source: string, fileId: string): Prepared}} LanguageAnalyzer
 *
 * prepare creates an independent, acyclic tree with zero scores, one owner map
 * entry per node, and no parser objects. Every non-null owner names a function;
 * each function root is in the tree and owned by its ID. analyze prepares a new
 * tree and runs the language's three independent passes. Presentation data also
 * survives parser disposal. If the original parser root has errors, comment ranges
 * are empty and every line annotation is outside the source block; recovery
 * cannot establish lexical boundaries safely. Each lineAnnotations row is zero-based; endIndex
 * and contentEndIndex are absolute UTF-16 offsets before the terminator;
 * contentEndIndex is present even when the safe endIndex is null.
 * null means the annotation must be placed outside the source block. Offsets
 * JavaScript line boundaries are CR, LF, CRLF, U+2028 and U+2029; renderers
 * retain these original boundaries even when endIndex is null. Offsets
 * refer to the original even when rendering removes comments: for example,
 * work(); // note\r\n uses the original line end, not the shortened text.
 * FileResult retains SourceFile or null on read failure and analysis=null when
 * a reliable tree cannot be made. RunError is separate from file diagnostics;
 * consumers merge analysis diagnostics once, preserving global errors.
 */

/** Unambiguous value identity for an outer within a normalized absolute file ID. */
export function outerId(fileId, ordinal) {
  if (typeof fileId !== 'string' || !Number.isSafeInteger(ordinal) || ordinal < 0) throw new TypeError('Invalid outer identity');
  return JSON.stringify([fileId, ordinal]);
}

/** Create a node with independent positions, children and local zero score. */
export function createAnalyzeNode({type, field = null, isNamed, startPosition, endPosition, startIndex, endIndex, children = []}) {
  return {type, field, isNamed, startPosition: {...startPosition}, endPosition: {...endPosition}, startIndex, endIndex, children: [...children], score: {cognitive: 0, cyclomatic: 0, statements: 0}};
}
