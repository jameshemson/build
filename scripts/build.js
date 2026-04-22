import { join } from 'path';
import { ROOT } from './transformers/utils.js';
import { PROVIDERS } from './transformers/providers.js';
import { build } from './transformers/builder.js';

const SOURCE_DIR = join(ROOT, 'source', 'skills');

console.log('Building...');
build({ root: ROOT, sourceDir: SOURCE_DIR, providers: PROVIDERS });
for (const [name, config] of Object.entries(PROVIDERS)) {
  console.log(`  ${name} → ${config.outputDir}`);
}
console.log('Done.');
