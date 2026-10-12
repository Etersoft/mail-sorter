const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createFakeLogger } = require('./testing-utils');

const HumanMessageHandler = require('../src/handlers/HumanMessageHandler');


describe('HumanMessageHandler', function () {
  const fromAddress = 'from-test@etersoft.ru';
  const replyToAddress = 'reply-to-test@etersoft.ru';
  const testAddress = 'test-non-existent@etersoft.ru';
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
      sendEmail: mock.fn(() => Promise.resolve())
    };
    handler = new HumanMessageHandler(fakeLogger, fakeSender, {
      forwardTo: testAddress,
      maxForwardDays: 7
    });
  });

  describe('#processMessage', function () {
    it('should forward emails that are no older than limit', async function () {
      const result = await handler.processMessage(message);
      assert.ok(fakeSender.sendEmail.mock.callCount() > 0);
      assert.equal(result.performedActions.length, 1);
      assert.equal(result.skipped, false);
    });

    it('should not forward emails that are older than limit', async function () {
      message.date.setFullYear(message.date.getFullYear() - 1);
      const result = await handler.processMessage(message);
      assert.equal(fakeSender.sendEmail.mock.callCount(), 0);
      assert.equal(result.performedActions.length, 0);
      assert.equal(result.skipped, false);
    });

    it('should set reply-to header = reply-to of original message, if set', async function () {
      await handler.processMessage(message);
      const sentEmail = fakeSender.sendEmail.mock.calls[0].arguments[0];
      assert.equal(sentEmail.replyTo, replyToAddress);
    });

    it('should set reply-to header = from of original message, if reply-to is not set',
      async function () {
        message.replyToAddress = null;
        await handler.processMessage(message);
        const sentEmail = fakeSender.sendEmail.mock.calls[0].arguments[0];
        assert.equal(sentEmail.replyTo, fromAddress);
      });
  });
});
