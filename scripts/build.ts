import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

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
const regions: unknown = JSON.parse(await readFile('node_modules/province-city-china/dist/level.json', 'utf8'));
await build({ stdin: { contents: `/* province-city-china 9.0.0; MIT; see assets/licenses */\nmodule.exports=${JSON.stringify(regions)};`, sourcefile: 'regions-source.js' }, outfile: 'miniprogram/services/regions.js', bundle: true, platform: 'neutral', format: 'cjs', target: 'es2018', minify: true });
