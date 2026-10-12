const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MultiDatabase = require('../src/databases/MultiDatabase');


function fakeDatabase (result) {
  return {
    calls: [],
    async disableEmailsForAddress (...args) {
      this.calls.push(args);
      return result;
    },
    async unsubscribeAddress (address) {
      this.calls.push([address]);
      return result;
    }
  };
}

describe('MultiDatabase', function () {
  for (const method of ['disableEmailsForAddress', 'unsubscribeAddress']) {
    describe('#' + method, function () {
      it('should call every database', async function () {
        const databases = [fakeDatabase(false), fakeDatabase(true)];
        await new MultiDatabase(databases)[method]('a@example.com');
        assert.deepEqual(databases.map(db => db.calls.length), [1, 1]);
      });

      it('should return true if any database has the address', async function () {
        const multi = new MultiDatabase([fakeDatabase(false), fakeDatabase(true)]);
        assert.equal(await multi[method]('a@example.com'), true);
      });

      it('should return false if no database has the address', async function () {
        const multi = new MultiDatabase([fakeDatabase(false), fakeDatabase(false)]);
        assert.equal(await multi[method]('a@example.com'), false);
      });
    });
  }
});
