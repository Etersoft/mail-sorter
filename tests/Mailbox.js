const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { EventEmitter } = require('events');
const stream = require('stream');
const { readFileSync } = require('fs');
const { join } = require('path');
const testEmail = readFileSync(join(__dirname, 'test-message.eml'), 'utf8');

const Mailbox = require('../src/Mailbox');


chai.use(chaiAsPromised);
const { assert } = chai;

describe('Mailbox', function() {
  // Initialization
  let fakeConnection, fetchObject, fakeMessage, mailbox, testError, fakeBox;

  beforeEach(function () {
    // Create a new fresh Mailbox instance before each test
    fakeMessage = new EventEmitter();
    fetchObject = new EventEmitter();
    fakeBox = {};
    testError = new Error();

    fakeConnection = Object.assign(Object.create(new EventEmitter()), {
      connect: sinon.spy(() => {
        process.nextTick(() => {
          fakeConnection.emit('ready');
        });
      }),
      openBox: sinon.spy((box, readonly, onOpen) => {
        process.nextTick(() => {
          onOpen(null, fakeBox);
        });
      }),
      fetch: sinon.spy(() => fetchObject),
      search: sinon.spy(),
      state: 'disconnected'
    });

    mailbox = new Mailbox({
      boxName: 'INBOX',
      connection: fakeConnection,
      readonly: true
    });
  });

  this.timeout(500);

  // Tests

  describe('constructor', function () {
    it('should be readonly by default', function () {
      mailbox = new Mailbox({
        boxName: 'INBOX',
        connection: fakeConnection
      });
      assert.isOk(mailbox.readonly);
    });
  });

  describe('#loadMessages', function () {
    it('should pass correct range to imap.fetch', function () {
      mailbox.loadMessages('1:3', () => {}, () => {});
      assert.isOk(fakeConnection.fetch.calledWith('1:3'));
    });

    it('should call onError on fetch error', function () {
      const errorSpy = sinon.spy();

      mailbox.loadMessages('1:3', () => {}, errorSpy);
      assert.isNotOk(errorSpy.called);
      fetchObject.emit('error', testError);
      assert.isOk(errorSpy.calledWith(testError));
    });

    it('should call onError on invalid message body', function (done) {
      mailbox.loadMessages('1:3', () => {}, error => {
        assert.isNotNull(error);
        done();
      });
      const fakeStream = new stream.Readable();
      fetchObject.emit('message', fakeMessage);
      fakeMessage.emit('body', fakeStream);
    });

    it('should call onError on stream error', function (done) {
      const fakeStream = new stream.Readable();
      fakeStream._read = () => {};

      mailbox.loadMessages('1:3', () => {}, error => {
        assert.equal(error, testError);
        done();
      });
      fetchObject.emit('message', fakeMessage);
      fakeMessage.emit('body', fakeStream);
      fakeStream.emit('error', testError);
    });

    it('should call onMessage for each parsed message', function (done) {
      mailbox.loadMessages('1:3', () => {
        done();
      });
      const fakeStream = new stream.Readable();
      fetchObject.emit('message', fakeMessage);
      fakeMessage.emit('body', fakeStream);
      fakeStream.push(new Buffer(testEmail));
      fakeStream.push(null);
      fakeMessage.emit('attributes', {});
      fakeMessage.emit('end');
    });
  });

  describe('#findUnseen', function () {
    it('should return array of unseed msg ids', function (done) {
      const ids = [1, 2, 3];
      mailbox.findUnseen().then(foundIds => {
        assert.equal(ids, foundIds);
        done();
      });
      process.nextTick(() => {
        fakeConnection.search.firstCall.args[1](null, ids);
      });
    });

    it('should throw promise error on search error', function (done) {
      mailbox.findUnseen().catch(error => {
        assert.equal(error, testError);
        done();
      });
      process.nextTick(() => {
        fakeConnection.search.firstCall.args[1](testError);
      });
    });
  });

  describe('#initialize', function () {
    it('will behave correctly with already initialized connection', async function () {
      fakeConnection.state = 'authenticated';

      await assert.isFulfilled(mailbox.initialize());

      assert.isOk(fakeConnection.openBox.calledOnce);
      assert.isOk(fakeConnection.openBox.calledWith('INBOX', true));
      assert.isNotOk(fakeConnection.connect.called);
    });

    it('will behave correctly with uninitialized connection', async function () {
      await assert.isFulfilled(mailbox.initialize());

      assert.isOk(fakeConnection.openBox.calledOnce);
      assert.isOk(fakeConnection.openBox.calledWith('INBOX', true));
      assert.isOk(fakeConnection.connect.calledOnce);
    });

    it('will throw on connection errors', async function () {
      fakeConnection.connect = () => {
        fakeConnection.emit('error', testError);
      };

      await assert.isRejected(mailbox.initialize(), testError);
    });

    it('will throw on openBox errors', async function () {
      fakeConnection.openBox = (box, readonly, onOpen) => {
        onOpen(testError);
      };

      await assert.isRejected(mailbox.initialize(), testError);
    });
  });
});
