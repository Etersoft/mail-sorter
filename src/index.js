const readConfig = require('./readConfig');
const Mailbox = require('./Mailbox');
const Imap = require('imap');

const CONFIG_HIERARCHY = [
  'config.default.json',
  'config.json'
];


async function main () {
  const config = readConfig(CONFIG_HIERARCHY);
  const mailbox = new Mailbox({
    boxName: 'INBOX',
    connection: config.imapConnection
  });
  await mailbox.initialize();
  const imap = mailbox.imapConnection;

  const inspect = a => a;

/*imap.openBox('INBOX', function(err, box) {
  if (err) throw err;
  var f = imap.seq.fetch(box.messages.total + ':*', { bodies: ['HEADER.FIELDS (FROM)','TEXT'] });
  f.on('message', function(msg, seqno) {
    console.log('Message #%d', seqno);
    var prefix = '(#' + seqno + ') ';
    msg.on('body', function(stream, info) {
      if (info.which === 'TEXT')
        console.log(prefix + 'Body [%s] found, %d total bytes', inspect(info.which), info.size);
      var buffer = '', count = 0;
      stream.on('data', function(chunk) {
        count += chunk.length;
        buffer += chunk.toString('utf8');
        if (info.which === 'TEXT')
          console.log(prefix + 'Body [%s] (%d/%d)', inspect(info.which), count, info.size);
      });
      stream.once('end', function() {
        if (info.which !== 'TEXT')
          console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)));
        else
          console.log(prefix + 'Body [%s] Finished', inspect(info.which));
      });
    });
    msg.once('attributes', function(attrs) {
      console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
    });
    msg.once('end', function() {
      console.log(prefix + 'Finished');
    });
  });
  f.once('error', function(err) {
    console.log('Fetch error: ' + err);
  });
  f.once('end', function() {
    console.log('Done fetching all messages!');
    imap.end();
  });
});

await new Promise(resolve => 1);*/
  const messages = await mailbox.fetchMessages();
  console.log(JSON.stringify(messages, null, 2));
}

main().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
