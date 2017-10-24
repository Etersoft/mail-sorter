const IMAP = require('imap');
const { writeFileSync } = require('fs');
const createLogger = require('logger');

const ReadonlyMailbox = require('./ReadonlyMailbox');
const MailboxSorter = require('./MailboxSorter');
const MessageClassifier = require('./MessageClassifier');
const MessageTypes = require('./MessageTypes');
const HumanMessageHandler = require('./handlers/HumanMessageHandler');
const MailServerMessageHandler = require('./handlers/MailServerMessageHandler');
const MailingListDatabase = require('./MailingListDatabase');
const AutoresponderMessageHandler = require('./handlers/AutoresponderMessageHandler');
const MailboxSorterStatsCollector = require('./MailboxSorterStatsCollector');
const UnsubscribeMessageHandler = require('./handlers/UnsubscribeMessageHandler');


async function main (config, logger, database) {
  if (!logger) {
    logger = createLogger(config.logging);
  }

  const mailbox = new ReadonlyMailbox({
    boxName: 'INBOX',
    connection: new IMAP(config.imapConnection)
  });
  logger.info('Connecting...');
  await mailbox.initialize();

  const sorter = createMailboxSorter(config, mailbox, logger, database);
  const statsCollector = new MailboxSorterStatsCollector(sorter, MessageTypes.names, logger);
  await sorter.sort();

  statsCollector.logStats();

  dumpStatsIfEnabled(logger, sorter, config);

  logger.info('Done.');
}

module.exports = function (config, logger, database) {
  return main(config, logger, database).catch(error => {
    if (logger) {
      logger.error(error.stack);
    } else {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
    throw error;
  });
};

function dumpStatsIfEnabled (logger, sorter, config) {
  if (typeof config.failedAddressesFile === 'string') {
    const fileString = Array.from(
      sorter.handlerMap[MessageTypes.MAIL_SERVER].userDatabase.failedAddresses
    ).join('\n');
    writeFileSync(config.failedAddressesFile, fileString, 'utf8');
    logger.info(`Failed addresses dumped into ${config.failedAddressesFile}`);
  }

  if (typeof config.unsubscribedAddressesFile === 'string') {
    const fileString = Array.from(
      sorter.handlerMap[MessageTypes.MAIL_SERVER].userDatabase.unsubscribedAddresses
    ).join('\n');
    writeFileSync(config.unsubscribedAddressesFile, fileString, 'utf8');
    logger.info(`Unsubscribed addresses dumped into ${config.unsubscribedAddressesFile}`);
  }
}

function createMailboxSorter (config, mailbox, logger, database) {
  const classifier = new MessageClassifier(config.unsubscribeAdditionalAddress);
  const mailingListDatabase = database || new MailingListDatabase(logger);
  const handlerMap = {
    [MessageTypes.HUMAN]: new HumanMessageHandler(logger),
    [MessageTypes.MAIL_SERVER]: new MailServerMessageHandler(
      mailingListDatabase, mailbox, logger
    ),
    [MessageTypes.AUTORESPONDER]: new AutoresponderMessageHandler(mailbox, logger),
    [MessageTypes.UNSUBSCRIBE]: new UnsubscribeMessageHandler(mailbox, mailingListDatabase, logger)
  };
  return new MailboxSorter(mailbox, classifier, logger, {
    handlerMap,
    messageBatchSize: config.messageBatchSize
  });
}
