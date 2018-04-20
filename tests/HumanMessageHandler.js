const chai = require('chai');
const sinon = require('sinon');
const { createFakeLogger } = require('./testing-utils');

const FailureTypes = require('../src/FailureTypes');
const HumanMessageHandler = require('../src/handlers/HumanMessageHandler');


const { assert } = chai;

describe('HumanMessageHandler', function() {
  const fromAddress = 'from-test@etersoft.ru';
  const replyToAddress = 'reply-to-test@etersoft.ru';
  const testAddress = 'test-non-existent@etersoft.ru';
  const statsActions = ['updated stats'];
  let fakeLogger, fakeSender, handler, message;

  beforeEach(function () {
    message = {
      date: new Date(),
      fromAddress,
      headers: {
        'from': fromAddress,
        'reply-to': replyToAddress
      },
      replyToAddress,
      uid: 123
    };
    fakeLogger = createFakeLogger();
    fakeSender = {
      sendEmail: sinon.spy(() => Promise.resolve())
    };
    handler = new HumanMessageHandler(fakeLogger, fakeSender, {
      forwardTo: testAddress,
      maxForwardDays: 7
    });
  });

  this.timeout(500);

  describe('#processMessage', function () {
    it('should forward emails that are no older than limit', async function () {
      const result = await handler.processMessage(message);
      assert.isTrue(fakeSender.sendEmail.called);
      assert.equal(result.performedActions.length, 1);
      assert.equal(result.skipped, false);
    });

    it('should not forward emails that are older than limit', async function () {
      message.date.setFullYear(message.date.getFullYear() - 1);
      const result = await handler.processMessage(message);
      assert.isFalse(fakeSender.sendEmail.called);
      assert.equal(result.performedActions.length, 0);
      assert.equal(result.skipped, false);
    });

    it('should set reply-to header = reply-to of original message, if set', async function () {
      await handler.processMessage(message);
      const sentEmail = fakeSender.sendEmail.getCall(0).args[0];
      assert.equal(sentEmail.replyTo, replyToAddress);
    });

    it('should set reply-to header = from of original message, if reply-to is not set', async function () {
      message.replyToAddress = null;
      await handler.processMessage(message);
      const sentEmail = fakeSender.sendEmail.getCall(0).args[0];
      assert.equal(sentEmail.replyTo, fromAddress);
    });
  });
});
