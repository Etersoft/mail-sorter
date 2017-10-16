const { assert } = require('chai');
const sinon = require('sinon');
const { EventEmitter } = require('events');
const stream = require('stream');
const { sleep } = require('./utils');
const { readFileSync } = require('fs');
const { join } = require('path');
const testEmail = readFileSync(join(__dirname, 'test-message.eml'), 'utf8');

const Mailbox = require('../src/Mailbox');


describe('Mailbox', function() {
  // Initialization
  let fakeConnection, mailbox;

  beforeEach(function () {
    // Create a new fresh Mailbox instance before each test
    fakeConnection = {
      seq: {
        fetch: sinon.spy(() => new EventEmitter)
      }
    };

    mailbox = new Mailbox({
      boxName: 'INBOX',
      connection: fakeConnection
    });
  });

  // Tests

  describe('#loadMessagesRange', function() {
    this.timeout(500);

    it('should pass correct range to imap.fetch', function() {
      mailbox.loadMessagesRange(1, 3, () => {}, () => {});
      assert.isOk(fakeConnection.seq.fetch.calledWith('1:3'));
    });

    it('should call onError on fetch error', function() {
      const errorSpy = sinon.spy();
      const fetchObject = new EventEmitter();
      const testError = new Error();

      const fakeConnection = {
        seq: {
          fetch: () => fetchObject
        }
      };

      const mailbox = new Mailbox({
        boxName: 'INBOX',
        connection: fakeConnection
      });

      mailbox.loadMessagesRange(1, 3, () => {}, errorSpy);
      assert.isNotOk(errorSpy.called);
      fetchObject.emit('error', testError);
      assert.isOk(errorSpy.calledWith(testError));
    });

    it('should call onError on invalid message body', function(done) {
      const fakeMessage = new EventEmitter();
      const fetchObject = new EventEmitter();

      const fakeConnection = {
        seq: {
          fetch: () => fetchObject
        }
      };

      const mailbox = new Mailbox({
        boxName: 'INBOX',
        connection: fakeConnection
      });

      mailbox.loadMessagesRange(1, 3, () => {}, error => {
        assert.isNotNull(error);
        done();
      });
      fetchObject.emit('message', fakeMessage);
      fakeMessage.emit('body', null /* invalid body */);
    });

    it('should call onError on stream error', function(done) {
      const fakeMessage = new EventEmitter();
      const fakeStream = new stream.Readable();
      fakeStream._read = () => {};
      const fetchObject = new EventEmitter();
      const testError = new Error();

      const fakeConnection = {
        seq: {
          fetch: () => fetchObject
        }
      };

      const mailbox = new Mailbox({
        boxName: 'INBOX',
        connection: fakeConnection
      });

      mailbox.loadMessagesRange(1, 3, () => {}, error => {
        assert.equal(error, testError);
        done();
      });
      fetchObject.emit('message', fakeMessage);
      fakeMessage.emit('body', fakeStream);
      fakeStream.emit('error', testError);
    });

    it('should call onMessage for each parsed message', async function () {
      let fakeMessage = new EventEmitter();
      const fetchObject = new EventEmitter();
      const messageSpy = sinon.spy();

      const fakeConnection = {
        seq: {
          fetch: () => fetchObject
        }
      };

      const mailbox = new Mailbox({
        boxName: 'INBOX',
        connection: fakeConnection
      });

      mailbox.loadMessagesRange(1, 3, messageSpy, console.log);
      fetchObject.emit('message', fakeMessage);

      fakeMessage.emit('body', testEmail);
      fakeMessage.emit('attributes', {});
      fakeMessage.emit('end');
      // Because parser is async
      await sleep(200);
      assert.isOk(messageSpy.calledOnce);

      fetchObject.emit('message', fakeMessage);
      fakeMessage.emit('body', testEmail);
      fakeMessage.emit('attributes', {});
      fakeMessage.emit('end');
      await sleep(200);
      assert.isOk(messageSpy.calledTwice);
    });
  });
});
