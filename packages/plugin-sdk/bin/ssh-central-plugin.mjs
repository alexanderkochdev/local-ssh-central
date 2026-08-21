#!/usr/bin/env node
import { buildPlugin, packPlugin } from '../dist/cli.js';

const [cmd] = process.argv.slice(2);
const dir = process.cwd();

try {
  if (cmd === 'build') {
    console.log('Gebaut:', await buildPlugin(dir));
  } else if (cmd === 'pack') {
    console.log('Gepackt:', await packPlugin(dir));
  } else if (cmd === 'build-pack') {
    console.log('Gebaut:', await buildPlugin(dir));
    console.log('Gepackt:', await packPlugin(dir));
  } else {
    console.error('Nutzung: ssh-central-plugin <build|pack|build-pack>');
    process.exit(1);
  }
} catch (err) {
  console.error('Fehler:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
