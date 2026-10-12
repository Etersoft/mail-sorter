const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { deepMerge, readConfig } = require('../src/readConfig');


describe('readConfig', function () {
  let dir;

  before(function () {
    dir = mkdtempSync(join(tmpdir(), 'mail-sorter-config-'));
  });

  after(function () {
    rmSync(dir, { force: true, recursive: true });
  });

  function write (name, text) {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  }

  it('should merge files in order, replacing arrays', function () {
    const a = write('a.json', '{"x": {"y": 1, "z": 2}, "list": [1, 2]}');
    const b = write('b.json', '{"x": {"z": 3}, "list": [3]}');
    assert.deepEqual(readConfig([a, b], {}), { list: [3], x: { y: 1, z: 3 } });
  });

  it('should accept JSON5 with comments', function () {
    const path = write('c.json', '{\n  // comment\n  "a": 1,\n}');
    assert.deepEqual(readConfig([path], {}), { a: 1 });
  });

  it('should throw when a file is missing', function () {
    assert.throws(() => readConfig([join(dir, 'missing.json')], {}), /not found/);
  });

  it('should substitute environment variables', function () {
    const path = write('env.json', JSON.stringify({
      full: '%{PORT}', missing: '%{NOPE|25}', partial: 'host-%{HOST}'
    }));
    assert.deepEqual(readConfig([path], { HOST: 'mx', PORT: '993' }), {
      full: '993', missing: 25, partial: 'host-mx'
    });
  });

  it('should throw on unresolved variables without default', function () {
    const path = write('bad.json', '{"a": "%{NOPE}"}');
    assert.throws(() => readConfig([path], {}), /Unresolved/);
  });

  it('should substitute local references', function () {
    const path = write('local.json', JSON.stringify({
      copy: '@{source}', source: { a: 1 }, text: 'a=@{source.a}'
    }));
    assert.deepEqual(readConfig([path], {}), {
      copy: { a: 1 }, source: { a: 1 }, text: 'a=1'
    });
  });

  it('should inherit from __parent relative to the file', function () {
    write('parent.json', '{"a": 1, "b": {"c": 2, "d": 3}}');
    const child = write('child.json', '{"__parent": "parent.json", "b": {"d": 4}}');
    assert.deepEqual(readConfig([child], {}), { a: 1, b: { c: 2, d: 4 } });
  });

  it('deepMerge should skip undefined values', function () {
    assert.deepEqual(deepMerge({ a: 1 }, { a: undefined, b: 2 }), { a: 1, b: 2 });
  });
});
