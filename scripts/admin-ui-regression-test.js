import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = await readFile(resolve(process.cwd(), 'public', 'admin.js'), 'utf8');

assert.equal(
  source.includes('event.currentTarget.reset()'),
  false,
  'Submit handlers must capture the form before await; event.currentTarget is null after async dispatch.'
);

assert.equal(
  source.includes('event.currentTarget.elements'),
  false,
  'Submit handlers must capture the form before await; event.currentTarget.elements is unsafe after async dispatch.'
);

console.log(JSON.stringify({ ok: true, checked: 'admin async submit handlers' }, null, 2));
