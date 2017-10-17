const IMAP = require('imap');

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


async function main () {
  const config = readConfig(CONFIG_HIERARCHY);

  const mailbox = new ReadonlyMailbox({
    boxName: 'INBOX',
    connection: new IMAP(config.imapConnection)
  });
  console.log('Connecting...');
  await mailbox.initialize();

  const mailServerMessageHandler = new MailServerMessageHandler(
    new MailingListDatabase(), mailbox, config.temporaryFailureLimit
  );
  const sorter = createMailboxSorter(config, mailbox, mailServerMessageHandler);
  const stats = await sorter.sort();

  if (stats) {
    console.log('Sorting stats:');
    Object.keys(stats).forEach(field => {
      console.log(`  ${field}: ${stats[field]}`);
    });
  }
}

main().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(error => {
  console.error(error.stack);
  process.exit(1);
});


function createMailboxSorter (config, mailbox, mailServerMessageHandler) {
  const classifier = new MessageClassifier();
  const handlerMap = {
    [MessageTypes.HUMAN]: new HumanMessageHandler(),
    [MessageTypes.MAIL_SERVER]: mailServerMessageHandler
  };
  return new MailboxSorter(mailbox, classifier, handlerMap, config.messageBatchSize);
}
