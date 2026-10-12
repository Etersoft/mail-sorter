const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const JSON5 = require('json5');


// Замена пакета read-config с сохранением используемых возможностей:
// - файлы в формате JSON5 (допускаются комментарии и висячие запятые);
// - поле "__parent": путь к файлу, от которого наследуется конфиг;
// - "%{NAME}" — значение переменной окружения NAME;
// - "@{path.to.field}" — значение другого поля конфига;
// - "%{NAME|default}" и "@{path|default}" — со значением по умолчанию.
// Если выражение занимает всю строку, подставляется значение как есть
// (число, объект), иначе — внутрь строки.
// Файлы накладываются по порядку, массивы заменяются целиком.

function deepMerge (target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value === undefined) {
      continue;
    }
    if (isPlainObject(value) && isPlainObject(target[key])) {
      result[key] = deepMerge(target[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject (value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readText (path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${path}`, { cause: error });
    }
    throw error;
  }
}

function loadFile (path, seen = new Set()) {
  const fullPath = resolve(path);
  if (seen.has(fullPath)) {
    throw new Error(`Config inheritance loop: ${fullPath}`);
  }
  seen.add(fullPath);

  const config = JSON5.parse(readText(fullPath));
  const parentPath = config.__parent;
  delete config.__parent;
  if (!parentPath) {
    return config;
  }
  const parent = loadFile(resolve(dirname(fullPath), parentPath), seen);
  return deepMerge(parent, config);
}

function getByPath (object, path) {
  let current = object;
  for (const key of path.split('.')) {
    if (!isPlainObject(current) && !Array.isArray(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function castDefault (value) {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return lower === 'true';
  }
  if (trimmed === 'null') {
    return null;
  }
  return trimmed === 'undefined' ? undefined : value;
}

function resolveExpression (expression, lookup) {
  const [name, defaultValue] = expression.split('|');
  const value = lookup(name.trim());
  if (value !== undefined) {
    return value;
  }
  if (defaultValue !== undefined) {
    return castDefault(defaultValue);
  }
  throw new Error(`Unresolved configuration variable: ${expression}`);
}

function replaceVariables (value, marker, lookup) {
  if (typeof value === 'string') {
    const full = new RegExp(`^\\s*\\${marker}\\{([^}]+)\\}\\s*$`).exec(value);
    if (full) {
      return resolveExpression(full[1], lookup);
    }
    return value.replace(new RegExp(`\\${marker}\\{([^}]+)\\}`, 'g'), (match, expression) => {
      const resolved = resolveExpression(expression, lookup);
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map(item => replaceVariables(item, marker, lookup));
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = replaceVariables(value[key], marker, lookup);
    }
    return result;
  }
  return value;
}

function readConfig (paths, env = process.env) {
  let config = {};
  for (const path of paths) {
    config = deepMerge(config, loadFile(path));
  }
  config = replaceVariables(config, '%', name => env[name]);
  const withEnv = config;
  return replaceVariables(withEnv, '@', path => getByPath(withEnv, path));
}

module.exports = { deepMerge, readConfig };
