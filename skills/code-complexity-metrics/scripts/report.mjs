const keys=[['Cognitive','cognitive_complexity'],['Cyclomatic','cyclomatic_complexity'],['Statements','statement_count']];
export function csv(report,records) {
 const field=value=>{
  const text=String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
 };
 const lines=[
  '# Code Complexity Metrics',
  `# Files: ${report.summary.files}; functions found: ${report.summary.functions_found}; functions presented: ${report.summary.functions_presented}`,
  `# Schema: ${report.schema_version}; rules: ${report.rules_version}; analyzer: ${report.analyzer_version}; parser: ${report.parser.package} ${report.parser.version}`,
  'Name,Location,Cognitive,Cyclomatic,Statements',
 ];
 for(const r of records) lines.push([r.name??'',`${r.file}:${r.start_line}:${r.start_column}`,r.metrics.cognitive_complexity,r.metrics.cyclomatic_complexity,r.metrics.statement_count].map(field).join(','));
 return lines.join('\n')+'\n';
}
function explain(record,info) {
 const {source,comments,literals}=info;
 const chars=source.split('');
 for(const [start,end] of comments) for(let i=start;i<end;i++) if(chars[i]!=='\n' && chars[i]!=='\r') chars[i]=' ';
 const lines=chars.join('').slice(record.startIndex,record.endIndex).split(/\r?\n/);
 const deferred=new Map(), output=[];
 function annotation(row) {
  return keys.map(([label,key])=>{
   if(record.metrics[key]===null) return `${label}: null`;
   const ev=record.events.filter(e=>e.metric===key&&e.line===row);
   const total=ev.reduce((sum,e)=>sum+e.amount,0);
   return `${label}: ${total?'+'+total:'0'}${total?' ('+[...new Set(ev.map(e=>e.rule))].join(', ')+')':''}`;
  }).join('; ');
 }
 for(let i=0;i<lines.length;i++) {
  const row=record.start_line-1+i;
  const literal=literals.find(([start,end,startIndex,endIndex])=>startIndex>=record.startIndex && endIndex<=record.endIndex && row>=start && row<end);
  if(literal) { output.push(lines[i]); const list=deferred.get(literal[1])??[]; list.push(`// line ${row+1}: ${annotation(row)}`); deferred.set(literal[1],list); }
  else output.push(`${lines[i]} // ${annotation(row)}`);
  if(deferred.has(row)) output.push(...deferred.get(row));
 }
 output.push('// '+keys.map(([label,key])=>`${label}: ${record.metrics[key]}`).join('; '));
 const content=output.join('\n');
 const max=Math.max(2,...[...content.matchAll(/`+/g)].map(m=>m[0].length));
 const fence='`'.repeat(max+1);
 return `${fence}${record.language==='javascript'?'javascript':'rust'}\n${content}\n${fence}\n`;
}
export function markdown(report,records,sourceInfo,showExplain) {
 let out=`# Code Complexity Metrics\n\nFiles: ${report.summary.files}; functions found: ${report.summary.functions_found}; functions presented: ${report.summary.functions_presented}\n\n`;
 out+=`Schema: ${report.schema_version}; rules: ${report.rules_version}; analyzer: ${report.analyzer_version}; parser: ${report.parser.package} ${report.parser.version}\n\n`;
 const cell=value=>String(value).replaceAll('\\','\\\\').replaceAll('|','\\|').replace(/\r?\n/g,' ');
 const headings=['Name','Location','Cognitive','Cyclomatic','Statements'];
 const rows=records.map(r=>[cell(r.name??'(anonymous)'),cell(`${r.file}:${r.start_line}:${r.start_column}`),String(r.metrics.cognitive_complexity),String(r.metrics.cyclomatic_complexity),String(r.metrics.statement_count)]);
 const widths=headings.map((heading,index)=>Math.max(3,heading.length,...rows.map(values=>values[index].length)));
 const row=values=>'| '+values.map((value,index)=>index<2?value.padEnd(widths[index]):value.padStart(widths[index])).join(' | ')+' |\n';
 out+=row(headings);
 out+='| '+headings.map((_,index)=>index<2?'-'.repeat(widths[index]):'-'.repeat(widths[index]-1)+':').join(' | ')+' |\n';
 for(const values of rows) out+=row(values);
 if(showExplain) for(const r of records) {
  out+=`\n## ${cell(r.name??'(anonymous)')} — ${cell(`${r.file}:${r.start_line}:${r.start_column}`)}\n\n`;
  out+=explain(r,sourceInfo.get(r.file))+'\n';
 }
 return out;
}
