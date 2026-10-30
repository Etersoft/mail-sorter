const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createFakeLogger } = require('./testing-utils');

const MailboxSorter = require('../src/MailboxSorter');
const MailboxSorterStatsCollector = require('../src/MailboxSorterStatsCollector');
const MessageTypes = require('../src/MessageTypes');


describe('MailboxSorterStatsCollector', function () {
  it('should summarize message types, actions and failures', function () {
    const sorter = new EventEmitter();
    const collector = new MailboxSorterStatsCollector(
      sorter, MessageTypes.names, createFakeLogger()
    );
    const { Events } = MailboxSorter;

    sorter.emit(Events.MESSAGE_CLASSIFIED, { id: 1 }, MessageTypes.MAIL_SERVER);
    sorter.emit(Events.MESSAGE_ACTIONS_PERFORMED, { id: 1 }, [
      'mark as read', 'disabled emails (excluded from mailing database)'
    ]);
    sorter.emit(Events.MESSAGE_PROCESSED, { id: 1 });
    sorter.emit(Events.MESSAGE_CLASSIFIED, { id: 2 }, MessageTypes.UNSUBSCRIBE);
    sorter.emit(Events.MESSAGE_ACTIONS_PERFORMED, { id: 2 }, ['mark as read', 'unsubscribe']);
    sorter.emit(Events.MESSAGE_PROCESSED, { id: 2 });
    sorter.emit(Events.MESSAGE_CLASSIFIED, { id: 3 }, MessageTypes.MAIL_SERVER);
    sorter.emit(Events.MESSAGE_ERROR, { id: 3 }, new Error('boom'));

    assert.deepEqual(collector.getSummary(), {
      actions: {
        'disabled emails (excluded from mailing database)': 1,
        'mark as read': 2,
        unsubscribe: 1
      },
      counters: { actionsPerformed: 2, failed: 1, successful: 2 },
      failedMessages: [3],
      types: { MAIL_SERVER: 2, UNSUBSCRIBE: 1 }
    });
  });
});
