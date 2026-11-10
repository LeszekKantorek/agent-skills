import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inputFiles, languageFor } from './input-files.mjs';
import { parse } from './parser.mjs';
import { outerFunctions, functionName } from './ir.mjs';
import { cognitiveEvents } from './metrics/cognitive.mjs';
import { cyclomaticEvents } from './metrics/cyclomatic.mjs';
import { statementEvents } from './metrics/statements.mjs';
import { markdown, csv } from './report.mjs';

function argumentsOf(args) {
 const result={ paths:[], format:'json', explain:false };
 for(let i=0;i<args.length;i++) {
  const key=args[i];
  if(key==='--explain') {result.explain=true;continue}
  if(!['--path','--format','--output','--filter'].includes(key) || i+1===args.length || args[i+1].startsWith('--')) throw new Error('Invalid arguments');
  const value=args[++i];
  if(key==='--path') result.paths.push(value); else result[key.slice(2)]=value;
 }
 if(!['json','markdown','csv'].includes(result.format)) throw new Error('Invalid format');
 return result;
}
function walk(node, fn) { fn(node); for(const c of node.namedChildren) walk(c,fn); }
function displayPath(file) { return path.relative(process.cwd(),file).replaceAll('\\','/') || path.basename(file); }
async function main() {
 const options=argumentsOf(process.argv.slice(2));
 const files=(await inputFiles(options.paths)).sort((a,b)=>{const x=displayPath(a),y=displayPath(b);return x<y?-1:x>y?1:0});
 let error=false;
 const records=[], sourceInfo=new Map();
 for(const file of files) {
  const language=languageFor(file), name=displayPath(file);
  if(!language) {error=true;continue}
  let parsed;
  try {
   const bytes=await readFile(file);
   const source=bytes.toString('utf8');
   parsed=await parse(source,language);
   if(parsed.tree.rootNode.hasError) {error=true;continue}
   const comments=[], literals=[];
   walk(parsed.tree.rootNode,n=>{
    if(n.type==='comment'||n.type.endsWith('_comment')) comments.push([n.startIndex,n.endIndex]);
    if(n.endPosition.row>n.startPosition.row && ['string','string_literal','raw_string_literal','template_string','regex'].includes(n.type)) literals.push([n.startPosition.row,n.endPosition.row,n.startIndex,n.endIndex]);
   });
   const fileRecords=[];
   for(const fn of outerFunctions(parsed.tree.rootNode)) {
    const metrics={cognitive_complexity:null,statement_count:null,cyclomatic_complexity:null};
    const events=[];
    for(const [key,measure] of [
     ['cognitive_complexity',()=>cognitiveEvents(fn)],
     ['cyclomatic_complexity',()=>cyclomaticEvents(fn)],
     ['statement_count',()=>statementEvents(fn,language)],
    ]) {
     try { const increments=measure(); events.push(...increments); metrics[key]=increments.reduce((total,event)=>total+event.amount,0); }
     catch {error=true}
    }
    const start_line=fn.startPosition.row+1,start_column=fn.startPosition.column+1;
    fileRecords.push({id:`${name}:${start_line}:${start_column}`,name:functionName(fn),language,file:name,start_line,start_column,end_line:fn.endPosition.row+1,metrics,events,startIndex:fn.startIndex,endIndex:fn.endIndex});
   }
   sourceInfo.set(name,{source,comments,literals,sha256:createHash('sha256').update(bytes).digest('hex')});
   records.push(...fileRecords);
  } catch {error=true} finally {parsed?.dispose()}
 }
 const found=records.length;
 const prefixes=options.filter===undefined?null:options.filter.split('|');
 const selected=records.filter(r=>!prefixes || r.name!==null && prefixes.some(prefix=>r.name.startsWith(prefix)));
 const report={schema_version:'1.2',rules_version:'1.0',analyzer_version:'0.1.0',parser:{package:'@vscode/tree-sitter-wasm',version:'0.3.1'},summary:{files:files.length,functions_found:found,functions_presented:selected.length},functions:selected.map(({id,name,metrics})=>({location:id,name,metrics}))};
 const output=options.explain || options.format==='markdown' ? markdown(report,selected,sourceInfo,options.explain) : options.format==='csv' ? csv(report,selected) : JSON.stringify(report,null,2)+'\n';
 if(options.output) await writeFile(options.output,output); else process.stdout.write(output);
 if(error) process.exitCode=1;
}
main().catch(()=>{process.exitCode=1});
