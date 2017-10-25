const IMAP = require('imap');
const createLogger = require('logger');

const ReadonlyMailbox = require('./ReadonlyMailbox');
const Mailbox = require('./Mailbox');
const MailboxSorter = require('./MailboxSorter');
const MessageClassifier = require('./MessageClassifier');
const MessageTypes = require('./MessageTypes');
const HumanMessageHandler = require('./handlers/HumanMessageHandler');
const MailServerMessageHandler = require('./handlers/MailServerMessageHandler');
const AutoresponderMessageHandler = require('./handlers/AutoresponderMessageHandler');
const MailboxSorterStatsCollector = require('./MailboxSorterStatsCollector');
const UnsubscribeMessageHandler = require('./handlers/UnsubscribeMessageHandler');


async function run (config, logger, database) {
  if (!logger) {
    logger = createLogger(config.logging);
  }

  const mailboxConfig = {
    boxName: 'INBOX',
    connection: new IMAP(config.imapConnection),
    readonly: config.readonly
  };
  if (config.readonly) {
    logger.info('Mailbox opened in readonly mode: no modifications will be made');
  }
  const mailbox = config.readonly ? new ReadonlyMailbox(mailboxConfig) : new Mailbox(mailboxConfig);
  logger.info('Connecting...');
  await mailbox.initialize();

  const sorter = createMailboxSorter(config, mailbox, logger, database);
  const statsCollector = new MailboxSorterStatsCollector(sorter, MessageTypes.names, logger);
  await sorter.sort();

  statsCollector.logStats();

  logger.info('Done.');
}

module.exports = function (config, logger, database) {
  return run(config, logger, database).catch(error => {
    if (logger) {
      logger.error(error.stack);
    } else {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
    throw error;
  });
};

function createMailboxSorter (config, mailbox, logger, database) {
  const classifier = new MessageClassifier(config.unsubscribeAdditionalAddress);
  const mailingListDatabase = database;
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
