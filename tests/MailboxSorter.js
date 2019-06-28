const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { createFakeLogger } = require('./testing-utils');

const MailboxSorter = require('../src/MailboxSorter');
const MessageTypes = require('../src/MessageTypes');


chai.use(chaiAsPromised);
const { assert } = chai;

describe('MailboxSorter', function() {
  // Initialization
  const [TYPE_1, TYPE_2] = [MessageTypes.HUMAN, MessageTypes.MAIL_SERVER];
  const BATCH_SIZE = 10;
  const messages = [
    {
      id: 1,
      uid: 1,
      type: TYPE_1
    }, {
      id: 3,
      uid: 3,
      type: TYPE_1
    }, {
      id: 2,
      uid: 2,
      type: TYPE_2
    }
  ];

  let fakeClassifier, fakeMailbox, fakeLogger, fakeActionLogger, handlerMap, sorter;
  let testError, unseenIds;

  beforeEach(function () {
    fakeClassifier = {
      classifyMessage: sinon.spy(message => {
        return message.type;
      })
    };

    fakeActionLogger = createFakeLogger();

    fakeLogger = createFakeLogger();

    fakeMailbox = {
      findUnseen: sinon.spy(() => {
        return Promise.resolve(unseenIds);
      }),
      loadMessages: sinon.spy((range, onMessage) => {
        process.nextTick(() => {
          const messagesToReturn = Array.isArray(range) ? (
            messages.filter(msg => range.indexOf(msg.id) !== -1)
          ) : messages;
          messagesToReturn.forEach(msg => onMessage(msg));
        });
      }),
      markAsRead: sinon.spy(() => Promise.resolve())
    };

    const result = {
      performedActions: ['test action'],
      reason: 'test reason',
      skipped: false
    };

    handlerMap = {
      [TYPE_1]: {
        processMessage: sinon.spy(() => Promise.resolve(result))
      },
      [TYPE_2]: {
        processMessage: sinon.spy(() => Promise.resolve(result))
      }
    };

    sorter = new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, fakeActionLogger, {
      actions: {
        markAsRead: true
      },
      actionsPerType: {},
      handlerMap,
      messageBatchSize: BATCH_SIZE
    });
    testError = new Error();
    unseenIds = [1, 2, 3];
  });

  this.timeout(500);

  // Tests
  describe('constructor', function () {
    it('should throw on null messageBatchSize value', function () {
      assert.throws(() => new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, null, {
        actionsPerType: {},
        handlerMap,
        messageBatchSize: null
      }));
    });

    it('should throw on negative messageBatchSize value', function () {
      assert.throws(() => new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, null, {
        actionsPerType: {},
        handlerMap,
        messageBatchSize: -1
      }));
    });
  });

  describe('#sort', function () {
    it('should fetch unread ids', async function () {
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeMailbox.findUnseen.calledOnce);
    });

    it('should behave correctly with empty unread list', async function () {
      unseenIds = [];
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeClassifier.classifyMessage.notCalled);
    });

    it('should call proper handlers for messages', async function () {
      await assert.isFulfilled(sorter.sort());
      messages.forEach(message => {
        const otherType = message.type === TYPE_1 ? TYPE_2 : TYPE_1;
        assert.isOk(handlerMap[message.type].processMessage.calledWith(message));
        assert.isNotOk(handlerMap[otherType].processMessage.calledWith(message));
      });
    });

    it('should not fail when handler is missing', async function () {
      delete handlerMap[TYPE_1];
      await assert.isFulfilled(sorter.sort());
    });

    it('should mark as read when handler returns { skipped: false }', async function () {
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeMailbox.markAsRead.calledWith(messages[2].uid));
    });

    it('should not mark as read when handler returns false', async function () {
      handlerMap[TYPE_2].processMessage = sinon.spy(() => Promise.resolve(false));
      await assert.isFulfilled(sorter.sort());
      assert.isNotOk(fakeMailbox.markAsRead.calledWith(messages[2].uid));
    });

    it('should throw on loadMessages error', async function () {
      fakeMailbox.loadMessages = (range, onMessage, onError) => {
        process.nextTick(() => {
          onMessage(messages[0]);
          onError(testError);
        });
      };
      await assert.isRejected(sorter.sort(), testError);
    });

    it('should throw on findUnseen error', async function () {
      fakeMailbox.findUnseen = () => Promise.reject(testError);
      await assert.isRejected(sorter.sort(), testError);
    });

    it('should not throw on handler error', async function () {
      handlerMap[TYPE_2].processMessage = () => Promise.reject(testError);
      await assert.isFulfilled(sorter.sort());
    });

    it('should not throw on classifier error', async function () {
      fakeClassifier.classifyMessage = () => {
        throw testError;
      };
      await assert.isFulfilled(sorter.sort());
    });

    it('should not throw on markAsRead error', async function () {
      fakeMailbox.markAsRead = () => Promise.reject(testError);
      await assert.isFulfilled(sorter.sort());
    });

    it('should warn on handler error', async function () {
      handlerMap[TYPE_2].processMessage = () => Promise.reject(testError);
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeLogger.warn.calledOnce);
    });

    it('should warn on classifier error', async function () {
      fakeClassifier.classifyMessage = () => {
        throw testError;
      };
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeLogger.warn.calledThrice);
    });

    it('should warn on markAsRead error', async function () {
      fakeMailbox.markAsRead = () => Promise.reject(testError);
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeLogger.warn.calledThrice);
    });

    it('should log actions to action log', async function () {
      await assert.isFulfilled(sorter.sort());
      assert.isOk(fakeActionLogger.info.calledThrice);
    });

    it('should behave correctly with batchSize = 1', async function () {
      sorter = new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, null, {
        actionsPerType: {},
        handlerMap,
        messageBatchSize: 1
      });
      await assert.isFulfilled(sorter.sort());
      assert.isOk(handlerMap[TYPE_1].processMessage.calledTwice);
      assert.isOk(handlerMap[TYPE_2].processMessage.calledOnce);
    });

    it('should behave correctly with batchSize = msgCount', async function () {
      sorter = new MailboxSorter(fakeMailbox, fakeClassifier, fakeLogger, null, {
        actionsPerType: {},
        handlerMap,
        messageBatchSize: messages.length
      });
      await assert.isFulfilled(sorter.sort());
      assert.isOk(handlerMap[TYPE_1].processMessage.calledTwice);
      assert.isOk(handlerMap[TYPE_2].processMessage.calledOnce);
    });
  });
});
