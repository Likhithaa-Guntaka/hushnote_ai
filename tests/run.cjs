#!/usr/bin/env node
/**
 * Runs every *.test.cjs in this directory and reports a combined result.
 *
 * Deliberately dependency-free beyond jsdom: the suites drive the real app.js
 * against the real index.html, so a test runner with its own module graph and
 * transform pipeline would add more to reason about than it removes. Exits
 * non-zero on any failure, so CI can gate on it.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const dir = __dirname;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.test.cjs'))
    .sort();

  if (files.length === 0) {
    console.error('No test suites found in tests/');
    process.exit(1);
  }

  const all = [];

  for (const file of files) {
    console.log(`\n=== ${file} ===`);
    const run = require(path.join(dir, file));
    try {
      // Suites may be sync or async; await handles both.
      const result = await run();
      all.push(result);
    } catch (err) {
      console.error(`  FAIL  suite threw before finishing: ${err && err.stack ? err.stack : err}`);
      all.push({ name: file, passed: 0, failed: 1, failures: [{ label: 'suite threw', actual: String(err), expected: 'no error' }] });
    }
  }

  const passed = all.reduce((n, r) => n + r.passed, 0);
  const failed = all.reduce((n, r) => n + r.failed, 0);

  console.log('\n----------------------------------------');
  for (const r of all) {
    console.log(`  ${r.failed === 0 ? 'PASS' : 'FAIL'}  ${r.name.padEnd(12)} ${r.passed} passed${r.failed ? `, ${r.failed} failed` : ''}`);
  }
  console.log('----------------------------------------');
  console.log(`  ${passed} assertions passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\nFailures:');
    for (const r of all) {
      for (const f of r.failures) {
        console.log(`  [${r.name}] ${f.label}`);
        console.log(`      expected: ${JSON.stringify(f.expected)}`);
        console.log(`      actual:   ${JSON.stringify(f.actual)}`);
      }
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
