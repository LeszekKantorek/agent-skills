import { adapter, languageOfFunction } from '../languages.mjs';
const same = (a,b) => a && b && a.id === b.id;
const op = n => n.children.find(c => ['&&','||','??'].includes(c.type));

// Emit localized increments; all totals are calculated from these same events.
export function complexityEvents(fn) {
  const language = adapter(languageOfFunction(fn));
  const isLogical = n => n && language.logical.has(n.type) && ['&&','||'].includes(op(n)?.type);
  const events = [{ metric: 'cyclomatic_complexity', amount: 1, line: fn.startPosition.row, rule: 'outer' }];
  const add = (metric, amount, node, rule) => events.push({metric, amount, line: node.startPosition.row, rule});
  const cog = (amount,node,rule) => add('cognitive_complexity',amount,node,rule);
  const cyc = (node,rule) => add('cyclomatic_complexity',1,node,rule);
  function visit(node, depth, chain = false) {
    if (!node || language.opaque.has(node.type)) return;
    if (isLogical(node)) { logicWithDepth(node, depth); return; }
    if (language.function.has(node.type) && !same(node,fn)) {
      for (const child of node.namedChildren) visit(child, depth + 1);
      return;
    }
    if (node.type === 'binary_expression' && op(node)?.type === '??') cyc(op(node), '??');
    if (language.decision.has(node.type)) {
      cyc(node,node.type); cog(chain ? 1 : depth + 1,node,node.type);
      const body = node.childForFieldName('body');
      const consequence = node.childForFieldName('consequence');
      const alternative = node.childForFieldName('alternative');
      for (const child of node.namedChildren) {
        if (same(child,alternative) && node.type === 'ternary_expression') visit(child, depth + 1);
        else if (same(child,alternative)) {
          const next = child.type === 'else_clause' ? child.namedChildren.find(n => n.type !== 'comment' && !n.type.endsWith('_comment')) : child;
          if (next && ['if_statement','if_expression'].includes(next.type)) visit(next,depth,true);
          else { cog(1,child,'else'); visit(child,depth + 1); }
        } else visit(child, depth + (same(child,body) || same(child,consequence) ? 1 : 0));
      }
      return;
    }
    if (language.selection.has(node.type)) {
      cog(depth + 1,node,node.type);
      const body = node.childForFieldName('body');
      for (const child of node.namedChildren) visit(child,depth + (same(child,body) ? 1 : 0));
      return;
    }
    if (language.branch.has(node.type)) cyc(node,node.type);
    if (node.type === 'catch_clause') {
      cog(depth + 1,node,'catch');
      const body = node.childForFieldName('body');
      for (const child of node.namedChildren) visit(child,depth + (same(child,body) ? 1 : 0));
      return;
    }
    if (['break_statement','continue_statement','break_expression','continue_expression'].includes(node.type) && node.namedChildren.some(n => ['statement_identifier','label','loop_label'].includes(n.type))) cog(1,node,node.type);
    for (const child of node.namedChildren) visit(child,depth);
  }
  function logicWithDepth(node,depth) {
    let previous;
    function flatten(n) {
      if (n.type === 'parenthesized_expression') { const inner=n.namedChildren.find(c=>c.type!=='comment' && !c.type.endsWith('_comment')); if(inner) return flatten(inner); }
      if (isLogical(n)) {
        for (const child of n.children) {
          if (['&&','||'].includes(child.type)) {
            cyc(child,child.type);
            if (child.type !== previous) cog(1,child,child.type);
            previous = child.type;
          } else if (child.isNamed) flatten(child);
        }
      } else visit(n,depth);
    }
    flatten(node);
  }
  visit(fn,0);
  return events;
}
