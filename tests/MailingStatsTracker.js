const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { createFakeLogger } = require('./testing-utils');

const FailureTypes = require('../src/FailureTypes');
const MailingStatsTracker = require('../src/MailingStatsTracker');


chai.use(chaiAsPromised);
const { assert } = chai;

describe('MailingStatsTracker', function() {
  const testAddress = 'test-non-existent@etersoft.ru';
  const statsActions = ['updated stats'];
  let fakeLogger, fakeMailingRepository, fakeStatsRepository, tracker;
  let addressStats, failureInfo, mailing;
  let clock;

  afterEach(function () {
    clock.restore();
  });

  beforeEach(function () {
    clock = sinon.useFakeTimers();
    failureInfo = {
      comment: `DSN status = 5.1.1`,
      dsnStatus: '5.1.1',
      listId: 'test-list-id',
      message: {},
      recipient: testAddress,
      status: FailureTypes.INVALID_ADDRESS
    };
    fakeLogger = createFakeLogger();
    fakeMailingRepository = {
      getByListId: sinon.spy(() => Promise.resolve(mailing)),
      updateInTransaction: sinon.spy(() => Promise.resolve(mailing))
    };
    fakeStatsRepository = {
      create: sinon.spy(() => Promise.resolve(addressStats)),
      getByEmail: sinon.spy(() => Promise.resolve(addressStats)),
      updateInTransaction: sinon.spy(() => Promise.resolve(addressStats))
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

  this.timeout(500);

  describe('#countFailure', function () {
    it('should not modify mailing info without list-id', async function () {
      failureInfo.listId = null;
      const actions = await tracker.countFailure(failureInfo);
      assert.isFalse(fakeMailingRepository.updateInTransaction.called);
      assert.deepEqual(actions, ['updated address stats']);
    });

    it('should modify mailing info with list-id', async function () {
      const actions = await tracker.countFailure(failureInfo);
      assert.isTrue(fakeMailingRepository.updateInTransaction.called);
      assert.deepEqual(actions, ['updated mailing stats', 'updated address stats']);
    });

    it('should not modify mailing stats for unknown list-id', async function () {
      fakeMailingRepository.getByListId = sinon.spy(() => Promise.resolve(null));
      const actions = await tracker.countFailure(failureInfo);
      assert.isFalse(fakeMailingRepository.updateInTransaction.called);
      assert.deepEqual(actions, ['updated address stats']);
    });

    it('should increment undeliveredCount for mailing in transaction', async function () {
      const actions = await tracker.countFailure(failureInfo);
      const transactionScenario = fakeMailingRepository.updateInTransaction.getCall(0).args[1];
      const initialValue = mailing.undeliveredCount;
      await transactionScenario(mailing);
      assert.equal(mailing.undeliveredCount, initialValue + 1);
    });

    it('should change lastStatus for address in transaction', async function () {
      const actions = await tracker.countFailure(failureInfo);
      const transactionScenario = fakeStatsRepository.updateInTransaction.getCall(0).args[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.lastStatus, failureInfo.dsnStatus);
    });

    it('should change lastStatusDate = now for address in transaction', async function () {
      const actions = await tracker.countFailure(failureInfo);
      const transactionScenario = fakeStatsRepository.updateInTransaction.getCall(0).args[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.lastStatusDate.getTime(), Date.now());
    });

    it('should increment temporaryFailureCount for temp failures', async function () {
      failureInfo.status = FailureTypes.TEMPORARY_FAILURE;
      const actions = await tracker.countFailure(failureInfo);
      const transactionScenario = fakeStatsRepository.updateInTransaction.getCall(0).args[1];
      const initialValue = addressStats.temporaryFailureCount;
      await transactionScenario(addressStats);
      assert.equal(addressStats.temporaryFailureCount, initialValue + 1);
    });

    it('should not increment temporaryFailureCount for non-temp failures', async function () {
      const actions = await tracker.countFailure(failureInfo);
      const transactionScenario = fakeStatsRepository.updateInTransaction.getCall(0).args[1];
      const initialValue = addressStats.temporaryFailureCount;
      await transactionScenario(addressStats);
      assert.equal(addressStats.temporaryFailureCount, initialValue);
    });

    it('should not create new address stats object if it was found in repo', async function () {
      const actions = await tracker.countFailure(failureInfo);
      assert.isFalse(fakeStatsRepository.create.called);
    });

    it('should create new address stats object if missing', async function () {
      fakeStatsRepository.updateInTransaction = () => Promise.resolve(null);
      const actions = await tracker.countFailure(failureInfo);
      assert.isTrue(fakeStatsRepository.create.calledOnce);
    });

    it('should change spam flag for address in transaction', async function () {
      failureInfo.spam = true;
      await tracker.countFailure(failureInfo);
      const transactionScenario = fakeStatsRepository.updateInTransaction.getCall(0).args[1];
      await transactionScenario(addressStats);
      assert.equal(addressStats.spam, true);
    });

    it('should set diagnosticCode for address in transaction', async function () {
      failureInfo.diagnosticCode = 'test';
      await tracker.countFailure(failureInfo);
      const transactionScenario = fakeStatsRepository.updateInTransaction.getCall(0).args[1];
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
