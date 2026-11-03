const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createFakeLogger } = require('./testing-utils');

const FailureTypes = require('../src/FailureTypes');
const MailingStatsTracker = require('../src/MailingStatsTracker');


function resolvesWith (value) {
  return mock.fn(() => Promise.resolve(value));
}

describe('MailingStatsTracker', function () {
  const testAddress = 'test-non-existent@etersoft.ru';
  let fakeLogger, fakeMailingRepository, fakeStatsRepository, tracker;
  let addressStats, failureInfo, mailing;

  afterEach(function () {
    mock.timers.reset();
  });

  beforeEach(function () {
    mock.timers.enable({ apis: ['Date'], now: 0 });
    failureInfo = {
      comment: 'DSN status = 5.1.1',
      dsnStatus: '5.1.1',
      listId: 'test-list-id',
      message: {},
      recipient: testAddress,
      status: FailureTypes.INVALID_ADDRESS
    };
    fakeLogger = createFakeLogger();
    fakeMailingRepository = {
      getByListId: mock.fn(() => Promise.resolve(mailing)),
      updateInTransaction: mock.fn(() => Promise.resolve(mailing))
    };
    fakeStatsRepository = {
      create: mock.fn(() => Promise.resolve(addressStats)),
      getByEmail: mock.fn(() => Promise.resolve(addressStats)),
      updateInTransaction: mock.fn(() => Promise.resolve(addressStats))
    };
    addressStats = {
      temporaryFailureCount: 1
    };
    mailing = {
      id: 1,
      undeliveredCount: 1
    };
    tracker = new MailingStatsTracker(fakeLogger, fakeMailingRepository, fakeStatsRepository);
  });

  describe('#countFailure', function () {
    it('should not modify mailing info without list-id', async function () {
      failureInfo.listId = null;
      const actions = await tracker.countFailure(failureInfo);
      assert.equal(fakeMailingRepository.updateInTransaction.mock.callCount(), 0);
      assert.deepEqual(actions, ['updated address stats']);
    });

    it('should modify mailing info with list-id', async function () {
      const actions = await tracker.countFailure(failureInfo);
      assert.ok(fakeMailingRepository.updateInTransaction.mock.callCount() > 0);
      assert.deepEqual(actions, ['updated mailing stats', 'updated address stats']);
    });

    it('should not modify mailing stats for unknown list-id', async function () {
      fakeMailingRepository.getByListId = resolvesWith(null);
      const actions = await tracker.countFailure(failureInfo);
      assert.equal(fakeMailingRepository.updateInTransaction.mock.callCount(), 0);
      assert.deepEqual(actions, ['updated address stats']);
    });

    it('should remember the mailing of the error in address stats', async function () {
      await tracker.countFailure(failureInfo);
      const scenario = fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      const stats = { temporaryFailureCount: 0 };
      await scenario(stats);
      assert.equal(stats.lastMailingId, 1);

      fakeStatsRepository.updateInTransaction = resolvesWith(null);
      failureInfo.listId = null;
      await tracker.countFailure(failureInfo);
      const created = fakeStatsRepository.create.mock.calls[0].arguments[0];
      assert.equal(created.lastMailingId, undefined);
    });

    it('should increment undeliveredCount for mailing in transaction', async function () {
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeMailingRepository.updateInTransaction.mock.calls[0].arguments[1];
      const initialValue = mailing.undeliveredCount;
      await transactionScenario(mailing);
      assert.equal(mailing.undeliveredCount, initialValue + 1);
    });

    it('should change lastStatus for address in transaction', async function () {
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.lastStatus, failureInfo.dsnStatus);
    });

    it('should change lastStatusDate = now for address in transaction', async function () {
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.lastStatusDate.getTime(), Date.now());
    });

    it('should increment temporaryFailureCount for temp failures', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      const initialValue = addressStats.temporaryFailureCount;
      await transactionScenario(addressStats);
      assert.equal(addressStats.temporaryFailureCount, initialValue + 1);
    });

    it('should not increment temporaryFailureCount for non-temp failures', async function () {
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      const initialValue = addressStats.temporaryFailureCount;
      await transactionScenario(addressStats);
      assert.equal(addressStats.temporaryFailureCount, initialValue);
    });

    it('should not create new address stats object if it was found in repo', async function () {
      await tracker.countFailure(failureInfo);
      assert.equal(fakeStatsRepository.create.mock.callCount(), 0);
    });

    it('should create new address stats object if missing', async function () {
      fakeStatsRepository.updateInTransaction = () => Promise.resolve(null);
      await tracker.countFailure(failureInfo);
      assert.equal(fakeStatsRepository.create.mock.callCount(), 1);
    });

    it('should change spam flag for address in transaction', async function () {
      failureInfo.spam = true;
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.spam, true);
    });

    it('should set diagnosticCode for address in transaction', async function () {
      failureInfo.diagnosticCode = 'test';
      await tracker.countFailure(failureInfo);
      const transactionScenario =
        fakeStatsRepository.updateInTransaction.mock.calls[0].arguments[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.diagnosticCode, 'test');
    });
  });

  describe('#getTemporaryFailureCount', function () {
    it('should return number when stats exists', async function () {
      const count = await tracker.getTemporaryFailureCount(testAddress);
      assert.equal(count, addressStats.temporaryFailureCount);
    });

    it('should return zero when field is not present', async function () {
      delete addressStats.temporaryFailureCount;
      const count = await tracker.getTemporaryFailureCount(testAddress);
      assert.equal(count, 0);
    });

    it('should return zero when address stats does not exist', async function () {
      addressStats = null;
      const count = await tracker.getTemporaryFailureCount(testAddress);
      assert.equal(count, 0);
    });
  });
});
