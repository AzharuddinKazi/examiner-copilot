'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const pm = require('..');

test('advisory inputs finish within a hard deadline in a separate process', () => {
  // A timer inside the matching process cannot detect a blocked event loop.
  const source = `
    const assert = require('node:assert/strict');
    const pm = require(process.argv[1]);
    const options = JSON.parse(process.argv[2]);
    const input = 'a'.repeat(50000) + '!';
    for (const pattern of ['+(*a)', '*(*a)', '+(a*)b', '+(*)b', '*(*)b',
      '+(@(*a))', '+(*[ab])', '+(*/*)', '*(@(a*))b', '+([*a)', '+([*a|b)']) {
      assert.equal(pm.makeRe(pattern, options).test(input), false, pattern);
      assert.equal(pm(pattern, options)(input), false, pattern);
    }
    assert.equal(pm.makeRe('+(*)', options).test('a'.repeat(50000) + '/'),
      options.bash === true);
    for (const pattern of ['+([*a)', '*([*a)b', '+([*a|b)']) {
      const bracketAttack = '[a'.repeat(25000) + '!';
      assert.equal(pm.makeRe(pattern, options).test(bracketAttack), false, pattern);
      assert.equal(pm(pattern, options)(bracketAttack), false, pattern);
    }
    // With brackets enabled, [*a] is a safe character class and contains:true
    // legitimately finds an "a". nobracket turns its star into a wildcard.
    for (const pattern of ['+([*a])', '+([*a]|b)']) {
      const balancedResult = pm(pattern, options)('[a'.repeat(25000) + '!');
      if (options.nobracket) assert.equal(balancedResult, false);
    }
  `;
  for (const options of [
    {}, { maxExtglobRecursion: false }, { maxExtglobRecursion: 100 },
    { windows: true }, { capture: true }, { contains: true },
    { nocase: true }, { flags: 'iu' }, { bash: true }, { fastpaths: false },
    { nobracket: true }, { nobracket: true, maxExtglobRecursion: false },
  ]) {
    const result = spawnSync(process.execPath,
      ['--max-old-space-size=64', '-e', source, require.resolve('..'), JSON.stringify(options)],
      { timeout: 3000, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('simple repeated wildcard semantics agree with the original on short inputs', () => {
  const originals = [
    ['+(*a)', /^(?:(?=.)(?:[^/]*?a)+)$/],
    ['*(*a)', /^(?:(?=.)(?:[^/]*?a)*)$/],
    ['+(a*b)', /^(?:(?=.)(?:a[^/]*?b)+)$/],
    ['+(*)', /^(?:(?=.)(?:[^/]*?)+)$/],
    ['x*(*a)y', /^(?:x(?:[^/]*?a)*y)$/],
  ];
  const strings = [''];
  for (let length = 0; length < 5; length++) {
    for (const value of strings.filter(str => str.length === length)) {
      for (const ch of ['a', 'b', '/', '.', '\n', 'x', 'y']) strings.push(value + ch);
    }
  }
  for (const [pattern, original] of originals) {
    const patched = pm.makeRe(pattern);
    for (const input of strings) {
      assert.equal(patched.test(input), original.test(input), `${pattern}: ${JSON.stringify(input)}`);
    }
  }
});

test('ordinary patterns and public helpers remain compatible', () => {
  assert(pm.isMatch('src/routes/index.ts', '**/*.{ts,tsx}'));
  assert(!pm.isMatch('src/routes/index.js', '**/*.{ts,tsx}'));
  assert(pm.isMatch('abab', '+(ab)'));
  assert(pm.isMatch('a*a', '+([*a])'));
  assert(pm.isMatch('aaabbb', '+(*(a)|*(b))'));
  assert(pm.isMatch('a*a*', '+("a*")'));
  assert(pm.isMatch('***', '+(\\*)'));
  assert(pm.isMatch('Québeca', '+(*a)'));
  assert(!pm.isMatch('a\\b', '+(a*b)', { windows: true }));
  assert(pm.isMatch('aab', '+(a*b)', { windows: true }));
  assert(pm.scan('src/**/*.ts').isGlob);
  assert(pm.makeRe('*.ts').test('index.ts'));
  assert(pm.compileRe(pm.parse('+(*a)')).test('aaaa'));
  assert.equal(typeof require('../posix'), 'function');
});

test('complex repeated wildcards fail closed and cannot regain unsafe capture modes', () => {
  for (const [pattern, options, literal] of [
    ['+(*[ab])', {}], ['+(*/*)', {}], ['+(*"a")', {}],
    ['+(*a)', { capture: true }], ['+(*a)', { contains: true }],
    ['+(.a*)', { bash: true }], ['+(\na*)', { bash: true }],
    ['+(*a)@(b)', {}, '+(*a)b'],
  ]) {
    assert(pm.makeRe(pattern, options).test(literal || pattern), pattern);
    assert(!pm.makeRe(pattern, options).test('a'.repeat(100) + '!'), pattern);
  }
  const state = pm.parse('+(*a)');
  assert.throws(() => pm.compileRe(state, { contains: true }), /Reparse repeated wildcard/);
  assert.throws(() => pm.compileRe(state, { capture: true }), /Reparse repeated wildcard/);
});

test('both legacy micromatch and current glob consumers use the hardened replacement', async () => {
  const apiRequire = createRequire(path.resolve(__dirname, '../../../artifacts/api-server/package.json'));
  const sandboxRequire = createRequire(path.resolve(__dirname, '../../../artifacts/mockup-sandbox/package.json'));
  const proxyRequire = createRequire(apiRequire.resolve('http-proxy-middleware'));
  const micromatchRequire = createRequire(proxyRequire.resolve('micromatch'));
  // A file: dependency is copied into pnpm's store, not the same module object.
  const assertHardenedConsumer = consumerRequire => {
    assert.equal(consumerRequire('picomatch/package.json').name, '@workspace/picomatch-safe');
    assert.equal(consumerRequire('picomatch/package.json').version, require('../package.json').version);
    assert.equal(consumerRequire('picomatch').makeRe('+(*a)').source, pm.makeRe('+(*a)').source);
    const result = spawnSync(process.execPath, ['-e', `
      const pm = require(process.argv[1]);
      const assert = require('node:assert/strict');
      assert.equal(pm('+(*a)')('a'.repeat(50000) + '!'), false);
      for (const options of [{}, { nobracket: true }, { maxExtglobRecursion: false }]) {
        for (const pattern of ['+([*a)', '+([*a])', '+([*a]|b)']) {
          assert.equal(pm(pattern, options)('[a'.repeat(25000) + '!'), false);
        }
      }
    `, consumerRequire.resolve('picomatch')], { timeout: 3000, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  };
  assertHardenedConsumer(micromatchRequire);
  const micromatch = proxyRequire('micromatch');
  assert.deepEqual(micromatch(['src/a.ts', 'src/b.js', 'test/c.ts'], ['src/**/*.ts']), ['src/a.ts']);
  assert.deepEqual(micromatch(['abc', '+(*[ab])'], '+(*[ab])'), ['+(*[ab])']);
  const fastGlob = sandboxRequire('fast-glob');
  assert(fastGlob.sync('lib/*.js', { cwd: path.resolve(__dirname, '..') }).includes('lib/parse.js'));
  const vitestRequire = createRequire(apiRequire.resolve('vitest/package.json'));
  assertHardenedConsumer(vitestRequire);
  const globby = await import(vitestRequire.resolve('tinyglobby'));
  const files = await globby.glob(['lib/*.js'], { cwd: path.resolve(__dirname, '..') });
  assert(files.includes('lib/parse.js'));
});
