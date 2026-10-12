const js = require('@eslint/js');
const globals = require('globals');


module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.node,
      sourceType: 'commonjs'
    },
    rules: {
      'indent': ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'max-depth': ['error', 3],
      'max-len': ['error', 100],
      'max-nested-callbacks': ['error', 3],
      'max-params': ['error', 5],
      'max-statements': ['error', 15],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always']
    }
  },
  {
    files: ['tests/**/*.js'],
    rules: {
      'max-nested-callbacks': ['error', 6],
      'max-statements': 'off'
    }
  }
];
