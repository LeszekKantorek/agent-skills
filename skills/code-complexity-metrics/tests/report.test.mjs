import {test} from 'node:test';
import assert from 'node:assert/strict';
import {markdown,csv} from '../scripts/report.mjs';
test('unavailable metrics stay null in explanation without a reason',()=>{
 const record={name:'f',file:'a.js',language:'javascript',start_line:1,start_column:1,end_line:1,startIndex:0,endIndex:14,metrics:{cognitive_complexity:null,cyclomatic_complexity:1,statement_count:0},events:[{metric:'cyclomatic_complexity',amount:1,line:0,rule:'outer'}]};
 const report={schema_version:'1',rules_version:'1',analyzer_version:'1',parser:{package:'p',version:'1'},summary:{files:1,functions_found:1,functions_presented:1},analyzed_files:[{file:'a.js',language:'javascript'}]};
 const output=markdown(report,[record],new Map([['a.js',{source:'function f(){}',comments:[],literals:[]}]]),true);
 assert.match(output,/Cognitive: null; Cyclomatic: \+1/);
 assert.doesNotMatch(output,/reason|status|diagnostic/i);
});
test('Markdown table escapes separators and keeps null values',()=>{
 const record={name:'a|b',file:'src/a|b.js',start_line:2,start_column:3,metrics:{cognitive_complexity:null,cyclomatic_complexity:1,statement_count:0}};
 const report={schema_version:'1',rules_version:'1',analyzer_version:'1',parser:{package:'p',version:'1'},summary:{files:1,functions_found:1,functions_presented:1},analyzed_files:[{file:record.file,language:'javascript'}]};
 const output=markdown(report,[record],new Map(),false);
 assert.match(output,/\| a\\\|b\s+\| src\/a\\\|b\.js:2:3\s*\|\s+null \|\s+1 \|\s+0 \|/);
 assert.doesNotMatch(output,/Analyzed files:/);
});
test('each table column uses the width of its longest value',()=>{
 const record={name:'long_function_name',file:'src/a.js',start_line:2,start_column:3,metrics:{cognitive_complexity:12,cyclomatic_complexity:3,statement_count:4}};
 const report={schema_version:'1',rules_version:'1',analyzer_version:'1',parser:{package:'p',version:'1'},summary:{files:1,functions_found:1,functions_presented:1}};
 const lines=markdown(report,[record],new Map(),false).split('\n').filter(line=>line.startsWith('|'));
 const widths=lines.map(line=>line.split('|').slice(1,-1).map(c=>c.length));
 assert.deepEqual(widths[0],widths[1]);
 assert.deepEqual(widths[0],widths[2]);
 assert.deepEqual(widths[0],[20,14,11,12,12]);
});
test('CSV quotes delimiters, quotes and newlines and preserves null metrics',()=>{
 const report={schema_version:'1',rules_version:'1',analyzer_version:'1',parser:{package:'p',version:'1'},summary:{files:1,functions_found:2,functions_presented:2}};
 const records=[{name:'save,"x"',file:'src/a,b.js',start_line:2,start_column:3,metrics:{cognitive_complexity:null,cyclomatic_complexity:1,statement_count:0}},{name:null,file:'line\nbreak.js',start_line:4,start_column:1,metrics:{cognitive_complexity:0,cyclomatic_complexity:1,statement_count:1}}];
 assert.equal(csv(report,records), '# Code Complexity Metrics\n# Files: 1; functions found: 2; functions presented: 2\n# Schema: 1; rules: 1; analyzer: 1; parser: p 1\nName,Location,Cognitive,Cyclomatic,Statements\n"save,""x""","src/a,b.js:2:3",null,1,0\n,"line\nbreak.js:4:1",0,1,1\n');
});
