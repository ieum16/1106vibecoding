import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('vendor',{recursive:true});
await copyFile('node_modules/@fontsource/geist/files/geist-latin-400-normal.woff2','vendor/geist.woff2');
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',outfile:'app.js',platform:'browser',target:'chrome116'});
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','vendor/pdf.worker.mjs');
console.log('빌드 완료: 현재 폴더를 Chrome에 등록하세요.');
