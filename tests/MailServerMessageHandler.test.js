const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const FailureTypes = require('../src/FailureTypes');
const MailServerMessageHandler = require('../src/handlers/MailServerMessageHandler');


function resolvesWith (value) {
  return mock.fn(() => Promise.resolve(value));
}

function calledWith (fn, ...args) {
  return fn.mock.calls.some(call => args.every((arg, i) => call.arguments[i] === arg));
}

describe('MailServerMessageHandler', function () {
  const testAddress = 'test-non-existent@etersoft.ru';
  const statsActions = ['updated stats'];
  let fakeDb, fakeStatsTracker, fakeFailureParser, failureInfo, handler, message;

  beforeEach(function () {
    message = {
      uid: 123
    };
    fakeDb = {
      disableEmailsForAddress: mock.fn(() => Promise.resolve(true))
    };
    fakeStatsTracker = {
      countFailure: mock.fn(() => Promise.resolve(statsActions)),
      getTemporaryFailureCount: mock.fn(() => Promise.resolve(0))
    };
    fakeFailureParser = {
      extractFailureInfo: mock.fn(() => Promise.resolve(failureInfo))
    };
    failureInfo = {
      comment: 'DSN status = 5.1.1',
      dsnStatus: '5.1.1',
      listId: 'test-list-id',
      message,
      recipient: testAddress,
      spam: false,
      status: FailureTypes.INVALID_ADDRESS
    };
    handler = new MailServerMessageHandler(fakeDb, fakeStatsTracker, fakeFailureParser, {
      maxTemporaryFailures: 2
    });
  });

  describe('#processMessage', function () {
    it('should return error on failure to extract info', async function () {
      failureInfo = null;
      const result = await handler.processMessage(message);
      assert.equal(result.skipped, true);
      assert.ok(!(result.performedActions && result.performedActions.length));
      assert.equal(fakeStatsTracker.countFailure.mock.callCount(), 0);
    });

    it('should count stats only once for each message', async function () {
      await handler.processMessage(message);
      assert.equal(fakeStatsTracker.countFailure.mock.callCount(), 1);
    });

    it('should exclude from database non-temporary failures', async function () {
      const result = await handler.processMessage(message);
      assert.equal(fakeDb.disableEmailsForAddress.mock.callCount(), 1);
      assert.ok(calledWith(fakeDb.disableEmailsForAddress, testAddress));
      assert.equal(result.skipped, false);
      assert.ok(result.performedActions.length);
    });

    it('should not include additional action when DB returned false', async function () {
      fakeDb.disableEmailsForAddress = () => false;
      const result = await handler.processMessage(message);
      assert.ok(!result.performedActions.includes(
        'disabled emails (excluded from mailing database)'
      ));
    });

    it('should not exclude temp failures that do not exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      await handler.processMessage(message);
      assert.equal(fakeDb.disableEmailsForAddress.mock.callCount(), 0);
    });

    it('should not skip temp failures that do not exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      const result = await handler.processMessage(message);
      assert.equal(result.skipped, false);
    });

    it('should not claim to perform actions on temp failures that do not exceed limit',
      async function () {
        failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
        const result = await handler.processMessage(message);
        assert.deepEqual(result.performedActions, statsActions);
      });

    it('should exclude temp failures that exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      fakeStatsTracker.getTemporaryFailureCount = resolvesWith(3);
      await handler.processMessage(message);
      assert.ok(calledWith(fakeDb.disableEmailsForAddress, testAddress));
    });

    it('should not exclude temp failures when limit = 0', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      handler = new MailServerMessageHandler(fakeDb, fakeStatsTracker, fakeFailureParser, {
        maxTemporaryFailures: 0
      });
      fakeStatsTracker.getTemporaryFailureCount = resolvesWith(3);
      await handler.processMessage(message);
      assert.equal(fakeDb.disableEmailsForAddress.mock.callCount(), 0);
    });

    it('should not skip temp failures that exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      fakeStatsTracker.getTemporaryFailureCount = resolvesWith(3);
      const result = await handler.processMessage(message);
      assert.equal(result.skipped, false);
    });

    it('should perform actions on temp failures that exceed limit', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      fakeStatsTracker.getTemporaryFailureCount = resolvesWith(3);
      const result = await handler.processMessage(message);
      assert.equal(result.performedActions.length, 2);
    });

    it('should not modify stats in readonly mode', async function () {
      handler = new MailServerMessageHandler(fakeDb, fakeStatsTracker, fakeFailureParser, {
        maxTemporaryFailures: 2,
        readonly: true
      });
      await handler.processMessage(message);
      assert.equal(fakeStatsTracker.countFailure.mock.callCount(), 0);
    });

    it('should not exclude mail.ru spam messages with non-temp statuses', async function () {
      failureInfo.spam = true;
      await handler.processMessage(message);
      assert.equal(fakeDb.disableEmailsForAddress.mock.callCount(), 0);
    });

    it('should count mail.ru spam messages with non-temp statuses', async function () {
      failureInfo.spam = true;
      await handler.processMessage(message);
      assert.ok(fakeStatsTracker.countFailure.mock.callCount() > 0);
    });
  });
});
