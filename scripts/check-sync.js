import { execSync } from 'child_process';
import { ROOT } from './transformers/utils.js';
import { PROVIDERS } from './transformers/providers.js';

// Run the build in-place, then check if git reports any changes to the
// output directories. Exits 1 if outputs are out of sync with source.

console.log('Running build...');
try {
  execSync('node scripts/build.js', { cwd: ROOT, stdio: 'inherit' });
} catch {
  process.exit(1);
}

const outputDirs = Object.values(PROVIDERS).map((p) => p.outputDir);
let dirty = false;

for (const dir of outputDirs) {
  const modified = execSync(`git diff --name-only -- "${dir}"`, { cwd: ROOT })
    .toString()
    .trim();
  const untracked = execSync(
    `git ls-files --others --exclude-standard -- "${dir}"`,
    { cwd: ROOT },
  )
    .toString()
    .trim();

  if (modified) {
    console.error(`Modified (not committed): ${modified}`);
    dirty = true;
  }
  if (untracked) {
    console.error(`Untracked (new files not committed): ${untracked}`);
    dirty = true;
  }
}

if (dirty) {
  console.error('\nOutputs are out of sync. Run `npm run build` and commit the results.');
  process.exit(1);
} else {
  console.log('Outputs are in sync.');
}
