const { assert } = require('chai');

const utils = require('../src/utils');


describe('utils', function() {
  this.timeout(500);

  describe('extractFromAddress', function () {
    it('should extract addresses of form NAME LASTNAME <FROM>', function () {
      const message = {
        headers: new Map([
          ['from', {
            text: 'Иван Иванов <ivan.ivanov.non-existent@yandex.ru>'
          }]
        ])
      };
      const from = utils.extractFromAddress(message);
      assert.equal(from, 'ivan.ivanov.non-existent@yandex.ru');
    });

    it('should extract addresses of form FROM', function () {
      const message = {
        headers: new Map([
          ['from', {
            text: 'ivan.ivanov.non-existent@yandex.ru'
          }]
        ])
      };
      const from = utils.extractFromAddress(message);
      assert.equal(from, 'ivan.ivanov.non-existent@yandex.ru');
    });

    it('should return equal results on subsequent calls', function () {
      const message = {
        headers: new Map([
          ['from', {
            text: 'ivan.ivanov.non-existent@yandex.ru'
          }]
        ])
      };
      const from1 = utils.extractFromAddress(message);
      const from2 = utils.extractFromAddress(message);
      assert.equal(from1, from2);
    });
  });
});
