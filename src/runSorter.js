const { ImapFlow } = require('imapflow');
const createLogger = require('./logger');

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
const FailureInfoParser = require('./FailureInfoParser');
const DsnParser = require('./DsnParser');
const SpecialHeaderParser = require('./SpecialHeaderParser');
const MailingStatsTracker = require('./MailingStatsTracker');
const SmtpMailSender = require('./services/SmtpMailSender');
const {
  createRedisClient, RedisAddressStatsRepository, RedisMailingRepository
} = require('./services/RedisRepositories');


/* eslint-disable max-statements */
async function run (config, logger, actionLogger, database, services = {}) {
  if (!logger) {
    logger = createLogger(config.logging);
  }

  const mailboxConfig = {
    connection: createImapClient(config.imapConnection),
    expungeOnClose: config.expungeOnClose,
    readonly: config.readonly
  };
  if (config.readonly) {
    logger.info('Mailbox opened in readonly mode: no modifications will be made');
  }
  const mailbox = config.readonly ? new ReadonlyMailbox(mailboxConfig) : new Mailbox(mailboxConfig);
  logger.verbose('Connecting...');
  await mailbox.initialize();

  const ownServices = await createDefaultServices(config, services);
  try {
    const sorter = createMailboxSorter({
      config, mailbox, logger, actionLogger, database, ...ownServices.services
    });
    const statsCollector = new MailboxSorterStatsCollector(sorter, MessageTypes.names, logger);

    for (const boxName of config.mailboxes) {
      logger.info('Processing mailbox: ' + boxName);
      await mailbox.setBoxName(boxName);
      await sorter.sort();
    }

    statsCollector.logStats();
    await mailbox.close();
  } finally {
    await ownServices.close();
  }

  logger.info('Done.');
}

// Параметры совместимы с конфигом модуля imap (node-imap), который
// использовался раньше: user, password, host, port, tls, tlsOptions
function createImapClient (imapConfig) {
  return new ImapFlow({
    auth: {
      pass: imapConfig.password,
      user: imapConfig.user
    },
    host: imapConfig.host,
    logger: false,
    port: imapConfig.port,
    secure: Boolean(imapConfig.tls),
    tls: imapConfig.tlsOptions
  });
}

// Хранилища статистики (Redis mail-server) и отправщик писем можно передать
// готовыми через services; чего нет — создаётся по конфигу
async function createDefaultServices (config, services) {
  const result = { ...services };
  const closers = [];

  if (config.redis && !(services.mailingRepository && services.addressStatsRepository)) {
    const client = createRedisClient(config.redis);
    await client.connect();
    closers.push(() => client.close());
    result.mailingRepository = services.mailingRepository ||
      new RedisMailingRepository(client, config.redis.prefixes);
    result.addressStatsRepository = services.addressStatsRepository ||
      new RedisAddressStatsRepository(client, config.redis.prefixes);
  }

  if (config.mailer && !services.mailSender) {
    const sender = new SmtpMailSender(config.mailer);
    closers.push(() => sender.close());
    result.mailSender = sender;
  }

  return {
    services: result,
    async close () {
      for (const close of closers) {
        await close();
      }
    }
  };
}

module.exports = function (config, logger, actionLogger, database, services) {
  return run(config, logger, actionLogger, database, services).catch(error => {
    if (logger) {
      logger.error(error.stack);
    } else {
      console.error(error.stack);
    }
    throw error;
  });
};

function createMailboxSorter ({
  config, mailbox, logger, actionLogger, database,
  mailingRepository, addressStatsRepository, mailSender
}) {
  const classifier = new MessageClassifier(config.unsubscribeAdditionalAddress);
  const failureInfoParser = new FailureInfoParser(
    new DsnParser(logger), new SpecialHeaderParser(logger)
  );
  const statsTracker = new MailingStatsTracker(logger, mailingRepository, addressStatsRepository);
  const mailingListDatabase = database;
  const handlerMap = {
    [MessageTypes.HUMAN]: new HumanMessageHandler(logger, mailSender, {
      forwardTo: config.forwardTo,
      maxForwardDays: config.maxForwardDays
    }),
    [MessageTypes.MAIL_SERVER]: new MailServerMessageHandler(
      mailingListDatabase, statsTracker, failureInfoParser, {
        maxTemporaryFailures: config.maxTemporaryFailures,
        readonly: config.readonly
      }
    ),
    [MessageTypes.AUTORESPONDER]: new AutoresponderMessageHandler(mailbox, logger),
    [MessageTypes.UNSUBSCRIBE]: new UnsubscribeMessageHandler(mailbox, mailingListDatabase, logger)
  };
  const actionsPerType = {};
  for (const type in config.actionsPerType) {
    if (type in MessageTypes) {
      actionsPerType[MessageTypes[type]] = config.actionsPerType[type];
    }
  }
  return new MailboxSorter(mailbox, classifier, logger, actionLogger, {
    actions: config.actions,
    actionsPerType,
    handlerMap,
    messageBatchSize: config.messageBatchSize
  });
}
