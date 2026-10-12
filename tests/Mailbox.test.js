const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const Mailbox = require('../src/Mailbox');
const ReadonlyMailbox = require('../src/ReadonlyMailbox');


const DSN_SOURCE = readFileSync(join(__dirname, 'message-examples', 'standard-dsn.eml'));

function createFakeClient () {
  return {
    connect: mock.fn(async () => {}),
    fetchAll: mock.fn(async () => []),
    logout: mock.fn(async () => {}),
    mailboxClose: mock.fn(async () => true),
    mailboxOpen: mock.fn(async path => ({ path })),
    messageFlagsAdd: mock.fn(async () => true),
    search: mock.fn(async () => [1, 2, 3]),
    usable: false
  };
}

describe('Mailbox', function () {
  let client, mailbox;

  beforeEach(function () {
    client = createFakeClient();
    mailbox = new Mailbox({ connection: client, readonly: false });
  });

  describe('constructor', function () {
    it('should be readonly by default', function () {
      assert.equal(new Mailbox({ connection: client }).readonly, true);
    });
  });

  describe('#loadMessages', function () {
    it('should fetch messages by UID', async function () {
      await mailbox.loadMessages([3, 5, 8], () => {});
      assert.equal(client.fetchAll.mock.callCount(), 1);
      const [range, query, options] = client.fetchAll.mock.calls[0].arguments;
      assert.equal(range, '3,5,8');
      assert.equal(query.source, true);
      assert.equal(query.internalDate, true);
      assert.deepEqual(options, { uid: true });
    });

    it('should call onError on fetch error', async function () {
      const testError = new Error('fetch failed');
      client.fetchAll = mock.fn(async () => { throw testError; });
      const onError = mock.fn();
      await mailbox.loadMessages([1], () => {}, onError);
      assert.deepEqual(onError.mock.calls[0].arguments, [testError]);
    });

    it('should reject on fetch error without onError', async function () {
      client.fetchAll = mock.fn(async () => { throw new Error('fetch failed'); });
      await assert.rejects(mailbox.loadMessages([1], () => {}), /fetch failed/);
    });

    it('should call onError on invalid message body', async function () {
      client.fetchAll = mock.fn(async () => [{ seq: 1, source: null, uid: 10 }]);
      const onMessage = mock.fn();
      const onError = mock.fn();
      await mailbox.loadMessages([10], onMessage, onError);
      assert.equal(onMessage.mock.callCount(), 0);
      assert.equal(onError.mock.callCount(), 1);
    });

    it('should call onMessage for each parsed message', async function () {
      const date = new Date('2018-04-03T09:30:41Z');
      client.fetchAll = mock.fn(async () => [
        { internalDate: date, seq: 1, source: DSN_SOURCE, uid: 10 },
        { internalDate: date, seq: 2, source: DSN_SOURCE, uid: 11 }
      ]);
      const messages = [];
      await mailbox.loadMessages([10, 11], async message => {
        messages.push(message);
      });

      assert.deepEqual(messages.map(m => m.uid), [10, 11]);
      assert.deepEqual(messages.map(m => m.id), [1, 2]);
      assert.equal(messages[0].date, date);
      assert.equal(messages[0].mailbox, mailbox);
      assert.equal(messages[0].source, DSN_SOURCE);
    });

    it('should keep delivery-status parts as attachments', async function () {
      client.fetchAll = mock.fn(async () => [{ seq: 1, source: DSN_SOURCE, uid: 10 }]);
      let message;
      await mailbox.loadMessages([10], m => { message = m; });
      const types = message.attachments.map(a => a.contentType);
      assert.ok(types.includes('message/delivery-status'));
    });

    it('should wait for onMessage before processing next message', async function () {
      client.fetchAll = mock.fn(async () => [
        { seq: 1, source: DSN_SOURCE, uid: 10 },
        { seq: 2, source: DSN_SOURCE, uid: 11 }
      ]);
      const events = [];
      await mailbox.loadMessages([10, 11], async message => {
        events.push('start ' + message.uid);
        await new Promise(resolve => setImmediate(resolve));
        events.push('end ' + message.uid);
      });
      assert.deepEqual(events, ['start 10', 'end 10', 'start 11', 'end 11']);
    });
  });

  describe('#findUnseen', function () {
    it('should return array of unseen message UIDs', async function () {
      assert.deepEqual(await mailbox.findUnseen(), [1, 2, 3]);
      assert.deepEqual(client.search.mock.calls[0].arguments, [{ seen: false }, { uid: true }]);
    });

    it('should return empty array if search returned nothing', async function () {
      client.search = mock.fn(async () => false);
      assert.deepEqual(await mailbox.findUnseen(), []);
    });

    it('should reject on search error', async function () {
      client.search = mock.fn(async () => { throw new Error('search failed'); });
      await assert.rejects(mailbox.findUnseen(), /search failed/);
    });
  });

  describe('#initialize', function () {
    it('will not reconnect already connected client', async function () {
      client.usable = true;
      await mailbox.initialize();
      assert.equal(client.connect.mock.callCount(), 0);
    });

    it('will connect unconnected client', async function () {
      await mailbox.initialize();
      assert.equal(client.connect.mock.callCount(), 1);
    });

    it('will throw on connection errors', async function () {
      client.connect = mock.fn(async () => { throw new Error('connection failed'); });
      await assert.rejects(mailbox.initialize(), /connection failed/);
    });
  });

  describe('#setBoxName', function () {
    it('should open mailbox in read-write mode', async function () {
      await mailbox.setBoxName('INBOX');
      assert.deepEqual(client.mailboxOpen.mock.calls[0].arguments, [
        'INBOX', { readOnly: false }
      ]);
    });

    it('should open mailbox in readonly mode for ReadonlyMailbox', async function () {
      await new ReadonlyMailbox({ connection: client }).setBoxName('INBOX');
      assert.deepEqual(client.mailboxOpen.mock.calls[0].arguments, [
        'INBOX', { readOnly: true }
      ]);
    });

    it('should expunge previous mailbox when expungeOnClose is set', async function () {
      mailbox = new Mailbox({ connection: client, expungeOnClose: true, readonly: false });
      await mailbox.setBoxName('INBOX');
      await mailbox.setBoxName('Junk');
      assert.equal(client.mailboxClose.mock.callCount(), 1);
    });
  });

  describe('#markAsRead and #deleteMessage', function () {
    it('should add \\Seen flag by UID', async function () {
      await mailbox.markAsRead(42);
      assert.deepEqual(client.messageFlagsAdd.mock.calls[0].arguments, [
        '42', ['\\Seen'], { uid: true }
      ]);
    });

    it('should add \\Deleted flag by UID', async function () {
      await mailbox.deleteMessage(42);
      assert.deepEqual(client.messageFlagsAdd.mock.calls[0].arguments, [
        '42', ['\\Deleted'], { uid: true }
      ]);
    });

    it('should not modify messages in ReadonlyMailbox', async function () {
      const readonlyMailbox = new ReadonlyMailbox({ connection: client });
      await readonlyMailbox.markAsRead(42);
      await readonlyMailbox.deleteMessage(42);
      assert.equal(client.messageFlagsAdd.mock.callCount(), 0);
    });
  });

  describe('#close', function () {
    it('should not expunge when expungeOnClose is false', async function () {
      await mailbox.setBoxName('INBOX');
      await mailbox.close();
      assert.equal(client.mailboxClose.mock.callCount(), 0);
      assert.equal(client.logout.mock.callCount(), 1);
    });

    it('should expunge when expungeOnClose is true', async function () {
      mailbox = new Mailbox({ connection: client, expungeOnClose: true, readonly: false });
      await mailbox.setBoxName('INBOX');
      await mailbox.close();
      assert.equal(client.mailboxClose.mock.callCount(), 1);
      assert.equal(client.logout.mock.callCount(), 1);
    });

    it('should not expunge readonly mailbox', async function () {
      mailbox = new ReadonlyMailbox({ connection: client, expungeOnClose: true });
      await mailbox.setBoxName('INBOX');
      await mailbox.close();
      assert.equal(client.mailboxClose.mock.callCount(), 0);
    });

    it('should throw if mailbox was not opened', async function () {
      await assert.rejects(mailbox.close(), /not opened/);
    });
  });
});
