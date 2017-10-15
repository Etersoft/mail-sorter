const IMAP = require('imap');

const readConfig = require('./readConfig');
const Mailbox = require('./Mailbox');
const MailboxSorter = require('./MailboxSorter');

const CONFIG_HIERARCHY = [
  'config.default.json',
  'config.json'
];


async function main () {
  const config = readConfig(CONFIG_HIERARCHY);

  const mailbox = new Mailbox({
    boxName: 'INBOX',
    connection: new IMAP(config.imapConnection)
  });
  await mailbox.initialize();

  const sorter = new MailboxSorter(mailbox);
  await sorter.sort();
}

main().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(error => {
  console.error(error.stack);
  process.exit(1);
});
