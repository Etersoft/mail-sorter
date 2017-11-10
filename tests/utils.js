const { assert } = require('chai');

const utils = require('../src/utils');


describe('utils', function() {
  this.timeout(500);

  describe('extractFromAddress', function () {
    it('should extract addresses of form NAME LASTNAME <FROM>', function () {
      const address = 'Иван Иванов <ivan.ivanov.non-existent@yandex.ru>';
      const from = utils.extractAddress(address);
      assert.equal(from, 'ivan.ivanov.non-existent@yandex.ru');
    });

    it('should extract addresses of form FROM', function () {
      const address = 'ivan.ivanov.non-existent@yandex.ru';
      const from = utils.extractAddress(address);
      assert.equal(from, 'ivan.ivanov.non-existent@yandex.ru');
    });

    it('should return equal results on subsequent calls', function () {
      const address = 'ivan.ivanov.non-existent@yandex.ru';
      const from1 = utils.extractAddress(address);
      const from2 = utils.extractAddress(address);
      assert.equal(from1, from2);
    });
  });
});
