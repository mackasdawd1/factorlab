const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sources={engine:'../v2/simulation.js',conversation:'../coach-conversation.cjs',adapter:'./coach-handler.cjs'};
const hashes={};
let bundle='';
for(const [name,file]of Object.entries(sources)){
  const bytes=fs.readFileSync(path.resolve(__dirname,file));
  hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');
  bundle+=`const ${name}=(()=>{const module={exports:{}};\n${bytes.toString('utf8')}\nreturn module.exports;})();\n`;
}
bundle+='Deno.serve(adapter.createHandler({env:key=>Deno.env.get(key),fetchImpl:fetch,engine,conversation}));\n';
const dir=path.resolve(__dirname,'../../deliverables/supabase-20261021');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'factorlab-coach-index.ts'),bundle);
fs.writeFileSync(path.join(dir,'factorlab-coach-index.txt'),bundle);
fs.writeFileSync(path.join(dir,'coach-manifest.json'),JSON.stringify({sources:hashes,bundleSha256:crypto.createHash('sha256').update(bundle).digest('hex'),bytes:Buffer.byteLength(bundle)},null,2)+'\n');
console.log('Prepared pasteable coach: '+Buffer.byteLength(bundle)+' bytes.');
