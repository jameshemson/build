import { readFileSync } from 'node:fs';
import { prepare, unblind } from './transformers/eval-ab.js';

const USAGE =
  'usage: node scripts/eval-ab.js prepare --skill <name> [...] | unblind --run-dir <dir> --grades <file> [...]';

const FLAGS = {
  prepare: {
    '--skill': 'string',
    '--base': 'string',
    '--runs': 'integer',
    '--control-runs': 'integer',
    '--headroom': 'boolean',
    '--seed': 'integer',
    '--key-dir': 'string',
    '--run-dir': 'string',
    '--repo': 'string',
  },
  unblind: {
    '--run-dir': 'string',
    '--grades': 'string',
    '--key-dir': 'string',
    '--margin': 'number',
  },
};

function parseFlags(command, args) {
  const spec = FLAGS[command];
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const type = Object.hasOwn(spec, flag) ? spec[flag] : null;
    if (!type) throw new Error(`unknown option ${flag}`);
    const name = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (type === 'boolean') {
      options[name] = true;
      continue;
    }
    const value = args[i + 1];
    if (value === undefined) throw new Error(`option ${flag} needs a value`);
    i += 1;
    if (type === 'string') {
      options[name] = value;
      continue;
    }
    const number = Number(value);
    if (value.trim() === '' || Number.isNaN(number) || (type === 'integer' && !Number.isInteger(number))) {
      throw new Error(`option ${flag} needs ${type === 'integer' ? 'an integer' : 'a number'}, got ${value}`);
    }
    options[name] = number;
  }
  return options;
}

function runPrepare(options) {
  const result = prepare(options);
  const mainRuns = result.runs.filter((entry) => entry.input === 'main').length;
  const controlRuns = result.runs.length - mainRuns;
  const lines = [
    `Run directory: ${result.runDir}`,
    `Base ref: ${result.base} (${result.baseSha})`,
    `Variants: ${result.variants.join(', ')}`,
    `Runs: ${mainRuns}${controlRuns > 0 ? ` (+${controlRuns} control)` : ''}`,
  ];
  if (options.headroom) {
    lines.push(`Headroom: base variant only, ${mainRuns} runs, no key`);
  } else {
    const { placebo } = result;
    if (placebo.skipped) {
      lines.push(`Placebo: skipped — ${placebo.reason}`);
    } else {
      const added = placebo.insertions.reduce((sum, insertion) => sum + insertion.addedChars, 0);
      const neutral = placebo.insertions.reduce((sum, insertion) => sum + insertion.placeboChars, 0);
      lines.push(`Placebo: ${placebo.insertions.length} insertions, ${added} added chars, ${neutral} placebo chars`);
    }
    lines.push(`Key: ${result.keyPath} (never pass this path to runner or grader agents)`);
  }
  console.log(lines.join('\n'));
}

function runUnblind(options) {
  if (!options.runDir) throw new Error('--run-dir is required');
  if (!options.grades) throw new Error('--grades is required');
  const grades = JSON.parse(readFileSync(options.grades, 'utf8'));
  const { markdown } = unblind({ runDir: options.runDir, grades, keyDir: options.keyDir, margin: options.margin });
  process.stdout.write(markdown);
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) throw new Error('missing command');
  if (!Object.hasOwn(FLAGS, command)) throw new Error(`unknown command ${command}`);
  const options = parseFlags(command, args);
  if (command === 'prepare') runPrepare(options);
  else runUnblind(options);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`eval-ab: ${error.message}`);
  console.error(USAGE);
  process.exitCode = 1;
}
