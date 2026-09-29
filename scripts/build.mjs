import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
const out=new URL('../dist/',import.meta.url);
await mkdir(out,{recursive:true});
for(const file of ['index.html','style.css','src'])await cp(new URL(`../${file}`,import.meta.url),new URL(file,out),{recursive:true});
// Ship no testing hooks, even if someone adds ?dev=1 on a public URL.
const main=new URL('src/main.js',out);
let code=await readFile(main,'utf8');
const start=code.indexOf('// Explicit opt-in development mode;');
const end=code.indexOf('\nfunction frame(now)',start);
code=code.slice(0,start)+'const devMode = false;\n'+code.slice(end);
await writeFile(main,code);
await writeFile(new URL('.nojekyll',out),'');
console.log('Static production game written to dist/; relative paths support GitHub Pages subpaths.');
