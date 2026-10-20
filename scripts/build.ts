import { build } from 'esbuild';

await build({
  entryPoints:['cloudfunctions/business-api/src/index.ts'],
  outfile:'cloudfunctions/business-api/index.js',
  bundle:true, platform:'node', format:'cjs', target:'node18', packages:'external', sourcemap:false,
});
await build({
  entryPoints:['packages/contracts/src/client.ts'],
  outfile:'miniprogram/services/client.js',
  bundle:true, platform:'neutral', format:'cjs', target:'es2018', sourcemap:false,
});
console.log('Built business-api and shared Mini Program request client');
await build({entryPoints:['packages/contracts/src/catalog-selection.ts'],outfile:'miniprogram/services/catalog-selection.js',bundle:true,platform:'neutral',format:'cjs',target:'es2018',sourcemap:false});
