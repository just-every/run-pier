// Scoped bridge for legacy acceptance rows while the inherited generator is held.
// CONTRACT.md supplies status, evidence and gaps; prose outside selected rows is retained.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const [mode,...ids]=process.argv.slice(2);
assert.ok(['write','check'].includes(mode)&&ids.length,'usage: node scripts/contract-docs.mjs write|check CLAUSE...');
let contract=await readFile('CONTRACT.md','utf8');
const rows=new Map(contract.split('\n').filter(line=>/^\| [A-Z]+-\d+ \|/.test(line)).map(line=>{const cells=line.split('|').slice(1,-1).map(cell=>cell.trim());return [cells[0],cells];}));
const groups=[['Published','published'],['Target','target'],['Push further','push-further'],['All',null]];
for(const [label,kind] of groups){const selected=[...rows.values()].filter(row=>!kind||row[2]===kind);const count=status=>selected.filter(row=>row[3]===status).length;contract=contract.replace(new RegExp('^\\| '+label+' \\|.*$','m'),`| ${label} | ${count('done')} | ${count('partial')} | ${count('missing')} | ${selected.length} |`);}
const all=[...rows.values()];contract=contract.replace(/\*\*\d+ clauses: \d+ done, \d+ partial, \d+ missing\.\*\*/,`**${all.length} clauses: ${all.filter(r=>r[3]==='done').length} done, ${all.filter(r=>r[3]==='partial').length} partial, ${all.filter(r=>r[3]==='missing').length} missing.**`);
let acceptance=await readFile('ACCEPTANCE.md','utf8');
for(const id of ids){const row=rows.get(id);assert.ok(row,'unknown clause '+id);const line=acceptance.split('\n').find(value=>value.startsWith('| '+id+' — '));assert.ok(line,'missing acceptance row '+id);const cells=line.split('|').slice(1,-1).map(value=>value.trim());cells[2]=row[4]+(row[5]?' Gap: '+row[5]:'');cells[3]='`'+row[3]+'`';acceptance=acceptance.replace(line,'| '+cells.join(' | ')+' |');}
// No homepage claim cites this native authentication slice; retain its projection.
const claims=await readFile('docs/CLAIMS.md','utf8');
for(const [path,expected] of [['CONTRACT.md',contract],['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]){
 if(mode==='write')await writeFile(path,expected);else assert.equal(await readFile(path,'utf8'),expected,path+' needs regeneration');
}
console.log('Contract projections '+mode+' passed for '+ids.join(', '));
