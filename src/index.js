const IMAP = require('imap');
const { createLogger, config: winstonConfig, format, transports } = require('winston');

const readConfig = require('./readConfig');
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

  const sorter = createMailboxSorter(config, mailbox, logger);
  const statsCollector = new MailboxSorterStatsCollector(sorter, MessageTypes.names, logger);
  await sorter.sort();

  statsCollector.logStats();

  logger.info('Done.');
}

main().then(() => {
  process.exit(0);
}).catch(error => {
  if (logger) {
    logger.error(error.stack);
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
      format.colorize(),
      format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
      new transports.Console()
    ]
  });
}

function createMailboxSorter (config, mailbox, logger) {
  const classifier = new MessageClassifier(config.unsubscribeAdditionalAddress);
  const mailingListDatabase = new MailingListDatabase(logger);
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
