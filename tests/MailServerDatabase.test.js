const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const MailServerDatabase = require('../src/databases/MailServerDatabase');


describe('MailServerDatabase', function () {
  let server;
  let database;
  const requests = [];

  before(async function () {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({ body: JSON.parse(body), url: req.url });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: { removed: 1 } }));
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const logger = { debug () {}, info () {} };
    database = new MailServerDatabase({
      backend: `http://127.0.0.1:${server.address().port}`
    }, logger);
  });

  after(function () {
    server.close();
  });

  it('should remove undeliverable addresses from all mailings', async function () {
    requests.length = 0;
    assert.equal(await database.disableEmailsForAddress('a@example.com'), true);
    assert.deepEqual(requests, [
      { body: { email: 'a@example.com' }, url: '/mailings/unsubscribe' }
    ]);
  });

  it('should unsubscribe only from mailings with List-Unsubscribe', async function () {
    requests.length = 0;
    assert.equal(await database.unsubscribeAddress('a@example.com'), true);
    assert.deepEqual(requests, [{
      body: { email: 'a@example.com', listUnsubscribe: true },
      url: '/mailings/unsubscribe'
    }]);
  });
});
