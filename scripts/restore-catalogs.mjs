import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=resolve(new URL('..',import.meta.url).pathname);
const hash=b=>createHash('sha256').update(b).digest('hex');
let manifest;
try{manifest=JSON.parse(await readFile(resolve(root,'catalog-bundle/manifest.json'),'utf8'));}catch(e){if(e.code==='ENOENT')process.exit(0);throw e;}
if(manifest.version!==1||!Array.isArray(manifest.parts)||!manifest.parts.every(p=>/^part-\d{3}\.b64$/.test(p)))throw Error('Invalid catalog bundle manifest');
const chunks=[];for(const p of manifest.parts)chunks.push(Buffer.from(await readFile(resolve(root,'catalog-bundle',p),'utf8'),'base64'));
const packed=Buffer.concat(chunks);if(hash(packed)!==manifest.sha256)throw Error('Catalog bundle integrity check failed');
const data=JSON.parse(gunzipSync(packed).toString('utf8'));
if(data.version!==1||data.files.length!==manifest.fileCount)throw Error('Invalid catalog bundle contents');
const seen=new Set();for(const f of data.files){
 if(typeof f.path!=='string'||!/^dist\/(?:private-catalogs|assets\/private-catalogs)\//.test(f.path)||f.path.split('/').some(p=>p==='..'||p==='.')||seen.has(f.path))throw Error('Invalid bundled file path');
 seen.add(f.path);const path=resolve(root,f.path);if(!path.startsWith(root+sep))throw Error('Invalid catalog destination');
 const content=Buffer.from(data.objects[f.sha256]||'','base64');if(hash(content)!==f.sha256)throw Error('Catalog file integrity check failed: '+f.path);
 await mkdir(dirname(path),{recursive:true});await writeFile(path+'.restore-tmp',content);await rename(path+'.restore-tmp',path);
}
console.log(`Restored ${seen.size} catalog and asset files. Catalog data is included in this build.`);
