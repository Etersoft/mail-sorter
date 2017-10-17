const IMAP = require('imap');
const { createLogger, format, transports } = require('winston');

const readConfig = require('./readConfig');
const ReadonlyMailbox = require('./ReadonlyMailbox');
const MailboxSorter = require('./MailboxSorter');
const MessageClassifier = require('./MessageClassifier');
const MessageTypes = require('./MessageTypes');
const HumanMessageHandler = require('./handlers/HumanMessageHandler');
const MailServerMessageHandler = require('./handlers/MailServerMessageHandler');
const MailingListDatabase = require('./MailingListDatabase');

const CONFIG_HIERARCHY = [
  'config.default.json',
  'config.json'
];

let logger;


async function main () {
  initLogger();
  const config = readConfig(CONFIG_HIERARCHY, logger);
  adjustLogger(config);

  const mailbox = new ReadonlyMailbox({
    boxName: 'INBOX',
    connection: new IMAP(config.imapConnection)
  });
  logger.info('Connecting...');
  await mailbox.initialize();

  const mailServerMessageHandler = new MailServerMessageHandler(
    new MailingListDatabase(logger), mailbox, logger
  );
  const sorter = createMailboxSorter(config, mailbox, logger, mailServerMessageHandler);
  const stats = await sorter.sort();

  if (stats) {
    logger.info('Sorting stats:');
    Object.keys(stats).forEach(field => {
      logger.info(`  ${field}: ${stats[field]}`);
    });
  }

  logger.info('Done.');
}

main().then(() => {
  process.exit(0);
}).catch(error => {
  if (logger) {
    logger.error(error);
  } else {
    console.error(error.stack);
  }
  process.exit(1);
});

function adjustLogger (config) {
  logger.transports.forEach(transport => {
    transport.level = config.maxLogLevel;
  });
}

function initLogger () {
  logger = createLogger({
    format: format.combine(
      format(info => {
        info.timestamp = new Date().toLocaleString();
        return info;
      })(),
      format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
      new transports.Console()
    ]
  });
}

function createMailboxSorter (config, mailbox, logger, mailServerMessageHandler) {
  const classifier = new MessageClassifier();
  const handlerMap = {
    [MessageTypes.HUMAN]: new HumanMessageHandler(logger),
    [MessageTypes.MAIL_SERVER]: mailServerMessageHandler
  };
  return new MailboxSorter(mailbox, classifier, logger, {
    handlerMap,
    messageBatchSize: config.messageBatchSize
  });
}
