const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const { createFakeLogger } = require('./testing-utils');

const MailboxSorter = require('../src/MailboxSorter');
const MessageTypes = require('../src/MessageTypes');


const [TYPE_1, TYPE_2] = [MessageTypes.HUMAN, MessageTypes.MAIL_SERVER];
const BATCH_SIZE = 10;
const messages = [
  { id: 1, uid: 1, type: TYPE_1 },
  { id: 3, uid: 3, type: TYPE_1 },
  { id: 2, uid: 2, type: TYPE_2 }
];

function calledWith (fn, arg) {
  return fn.mock.calls.some(call => call.arguments[0] === arg);
}

function resolvesWith (value) {
  return mock.fn(() => Promise.resolve(value));
}

function isError (expected) {
  return err => err === expected;
}

function createFakeMailbox (getUnseenIds) {
  return {
    findUnseen: mock.fn(() => Promise.resolve(getUnseenIds())),
    loadMessages: mock.fn((range, onMessage) => {
      process.nextTick(() => {
        const messagesToReturn = Array.isArray(range) ?
          messages.filter(msg => range.includes(msg.id)) :
          messages;
        messagesToReturn.forEach(msg => onMessage(msg));
      });
    }),
    markAsRead: resolvesWith()
  };
}

function loadMessagesWithError (message, error) {
  return (range, onMessage, onError) => {
    process.nextTick(() => {
      onMessage(message);
      onError(error);
    });
  };
}

function constructSorter (...args) {
  return new MailboxSorter(...args);
}

describe('MailboxSorter', function () {
  let fakeClassifier, fakeMailbox, fakeLogger, fakeActionLogger, handlerMap, sorter;
  let testError, unseenIds;

  beforeEach(function () {
    fakeClassifier = {
      classifyMessage: mock.fn(message => message.type)
    };

    fakeActionLogger = createFakeLogger();
    fakeLogger = createFakeLogger();
    fakeMailbox = createFakeMailbox(() => unseenIds);

    const result = {
      performedActions: ['test action'],
      reason: 'test reason',
      skipped: false
    };

    handlerMap = {
      [TYPE_1]: { processMessage: resolvesWith(result) },
      [TYPE_2]: { processMessage: resolvesWith(result) }
    };

    sorter = new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, fakeActionLogger, {
      actions: { callHandler: true, markAsRead: true },
      actionsPerType: {},
      handlerMap,
      messageBatchSize: BATCH_SIZE
    });
    testError = new Error();
    unseenIds = [1, 2, 3];
  });

  describe('constructor', function () {
    it('should throw on null messageBatchSize value', function () {
      assert.throws(constructSorter.bind(null, fakeMailbox, fakeClassifier, fakeLogger, null, {
        actionsPerType: {},
        handlerMap,
        messageBatchSize: null
      }));
    });

    it('should throw on negative messageBatchSize value', function () {
      assert.throws(constructSorter.bind(null, fakeMailbox, fakeClassifier, fakeLogger, null, {
        actionsPerType: {},
        handlerMap,
        messageBatchSize: -1
      }));
    });
  });

  describe('#sort', function () {
    it('should fetch unread ids', async function () {
      await sorter.sort();
      assert.equal(fakeMailbox.findUnseen.mock.callCount(), 1);
    });

    it('should behave correctly with empty unread list', async function () {
      unseenIds = [];
      await sorter.sort();
      assert.equal(fakeClassifier.classifyMessage.mock.callCount(), 0);
    });

    it('should call proper handlers for messages', async function () {
      await sorter.sort();
      for (const message of messages) {
        const otherType = message.type === TYPE_1 ? TYPE_2 : TYPE_1;
        assert.ok(calledWith(handlerMap[message.type].processMessage, message));
        assert.ok(!calledWith(handlerMap[otherType].processMessage, message));
      }
    });

    it('should not fail when handler is missing', async function () {
      delete handlerMap[TYPE_1];
      await sorter.sort();
    });

    it('should mark as read when handler returns { skipped: false }', async function () {
      await sorter.sort();
      assert.ok(calledWith(fakeMailbox.markAsRead, messages[2].uid));
    });

    it('should not mark as read when handler returns false', async function () {
      handlerMap[TYPE_2].processMessage = resolvesWith(false);
      await sorter.sort();
      assert.ok(!calledWith(fakeMailbox.markAsRead, messages[2].uid));
    });

    it('should throw on loadMessages error', async function () {
      fakeMailbox.loadMessages = loadMessagesWithError(messages[0], testError);
      await assert.rejects(sorter.sort(), isError(testError));
    });

    it('should throw on findUnseen error', async function () {
      fakeMailbox.findUnseen = () => Promise.reject(testError);
      await assert.rejects(sorter.sort(), isError(testError));
    });

    it('should not throw on handler error', async function () {
      handlerMap[TYPE_2].processMessage = () => Promise.reject(testError);
      await sorter.sort();
    });

    it('should not throw on classifier error', async function () {
      fakeClassifier.classifyMessage = () => { throw testError; };
      await sorter.sort();
    });

    it('should not throw on markAsRead error', async function () {
      fakeMailbox.markAsRead = () => Promise.reject(testError);
      await sorter.sort();
    });

    it('should warn on handler error', async function () {
      handlerMap[TYPE_2].processMessage = () => Promise.reject(testError);
      await sorter.sort();
      assert.equal(fakeLogger.warn.mock.callCount(), 1);
    });

    it('should warn on classifier error', async function () {
      fakeClassifier.classifyMessage = () => { throw testError; };
      await sorter.sort();
      assert.equal(fakeLogger.warn.mock.callCount(), 3);
    });

    it('should warn on markAsRead error', async function () {
      fakeMailbox.markAsRead = () => Promise.reject(testError);
      await sorter.sort();
      assert.equal(fakeLogger.warn.mock.callCount(), 3);
    });

    it('should log actions to action log', async function () {
      await sorter.sort();
      assert.equal(fakeActionLogger.info.mock.callCount(), 3);
    });

    it('should behave correctly with batchSize = 1', async function () {
      sorter = new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, null, {
        actions: { callHandler: true },
        actionsPerType: {},
        handlerMap,
        messageBatchSize: 1
      });
      await sorter.sort();
      assert.equal(handlerMap[TYPE_1].processMessage.mock.callCount(), 2);
      assert.equal(handlerMap[TYPE_2].processMessage.mock.callCount(), 1);
    });

    it('should behave correctly with batchSize = msgCount', async function () {
      sorter = new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, null, {
        actions: { callHandler: true },
        actionsPerType: {},
        handlerMap,
        messageBatchSize: messages.length
      });
      await sorter.sort();
      assert.equal(handlerMap[TYPE_1].processMessage.mock.callCount(), 2);
      assert.equal(handlerMap[TYPE_2].processMessage.mock.callCount(), 1);
    });
  });
});
