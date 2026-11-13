import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate} from '../scripts/aggregation.mjs';

function input(fileId) {
 const id=JSON.stringify([fileId,0]),position=(column)=>({row:0,column});
 const child={type:'identifier',field:'name',isNamed:true,startIndex:0,endIndex:1,startPosition:position(0),endPosition:position(1),children:[],score:{cognitive:0,cyclomatic:0,statements:0}};
 const root={type:'function_declaration',field:null,isNamed:true,startIndex:0,endIndex:2,startPosition:position(0),endPosition:position(2),children:[child],score:{cognitive:0,cyclomatic:1,statements:0}};
 const diagnostic={code:'KNOWN',category:'parse',message:'known',fileId,range:{startIndex:0,endIndex:1,startPosition:position(0),endPosition:position(1)},owner:id,affectedMetrics:['statements'],affectsFunctionDiscovery:false};
 return {fileId,source:{fileId,source:'ab'},diagnostics:[],analysis:{tree:root,functions:[{id,name:'f',root}],ownerByNode:new Map([[root,id],[child,id]]),diagnostics:[diagnostic],presentation:{comments:[],unsafeCommentRanges:[],lineAnnotations:[{row:0,contentEndIndex:2,endIndex:2}]}}};
}
for(const [label,mutate] of [
 ['missing type',n=>delete n.type],['non-string type',n=>n.type=0],
 ['missing field',n=>delete n.field],['invalid field',n=>n.field=0],
 ['missing isNamed',n=>delete n.isNamed],['non-boolean isNamed',n=>n.isNamed='true'],
 ...['subtreeScore','analyzed','ownScore','sourceRange'].map(key=>[`forbidden ${key}`,n=>n[key]=0]),
]) test(`R09 invalid node ${label} rejects only its file`,()=>{
 const bad=input('C:/bad.js'),good=input('C:/good.js');good.analysis.diagnostics=[];
 const original=bad.analysis.diagnostics[0];mutate(bad.analysis.tree.children[0]);
 const result=aggregate([bad,good]);
 assert.deepEqual(result.files,[{fileId:bad.fileId,analyzed:false,functionDiscoveryComplete:false},{fileId:good.fileId,analyzed:true,functionDiscoveryComplete:true}]);
 assert.equal(result.functionDiscoveryComplete,false);assert.equal(result.hasErrors,true);
 assert.equal(result.functions.length,1);assert.equal(result.functions[0].fileId,good.fileId);assert.deepEqual(result.functions[0].metrics,{cognitive:0,cyclomatic:1,statements:0});
 assert.equal(result.diagnostics.length,2);assert.deepEqual(result.diagnostics.find(d=>d.code==='KNOWN'),original);
 assert.deepEqual(result.diagnostics.find(d=>d.code==='INVALID_ANALYSIS_CONTRACT'),{code:'INVALID_ANALYSIS_CONTRACT',category:'internal',message:'Invalid node shape',fileId:bad.fileId,range:null,owner:null,affectedMetrics:[],affectsFunctionDiscovery:true});
});
