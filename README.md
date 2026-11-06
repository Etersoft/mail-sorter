<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/eterpost-logo-dark.svg">
  <img alt="Eterpost" src="docs/eterpost-logo.svg" height="64">
</picture>

# eterpost-sorter

[Русский](README-ru.md) | **English**

This is a program for automated reading of mail server replies
([Delivery Status Notifications](https://en.wikipedia.org/wiki/Bounce_message))
and reacting to them.

## Description

When running mass mailings over a large database of email addresses you may find
out that some addresses are "broken". Sending emails to "broken" addresses too often may
lead to recognizing your emails as spam by some email services.

This problem can be solved via reacting to mail server responses
(Delivery Status Notification, DSN). Addresses that were reported as failed
are excluded from address database. This sorter is designed to read mailboxes
automatically, such as `noreply@some.domain`, that usually receive lots of DSNs
mixed with other sorts of emails.

Sorter is started on schedule (for example, once per hour via cron). It reads
new messages in specified mailbox via IMAP protocol. Each message gets classified by type,
and message type defines actions to be performed.

## Working with mail-server

mail-sorter is a part of the mailing system around
[mail-server](https://github.com/Eterpost/eterpost-server) (see its README for the
whole picture), but can be used with any address database. With mail-server:

- point `imapConnection` to the mailbox that receives replies to mailings
  (the `server.mail.from` address of mail-server);
- set `redis` to the same Redis server, database and `prefixes` as mail-server:
  bounces are counted per mailing (found by the `List-Id` header of the original
  letter) and per address, and mail-server shows them as delivery errors;
- use the `mail-server` database driver: excluded addresses are removed from all
  mailings via its API;
- the result of every run is written to Redis (key `MAIL_SORTER_STATUS`, prefix
  `sorterStatusKey`): times, success or error, message counts per type and
  performed actions, failed message numbers and the time of the last successful
  run. Runs with `readonly` are recorded too (with `"readonly": true`).
  mail-server shows the result in its web interface.

```json
{
  "database": { "type": "mail-server", "options": { "backend": "http://mail-server:8000" } },
  "redis": { "host": "localhost", "port": 6379, "db": 0 }
}
```

## Installation and running

You will need:
* Node.js 22.12 or newer
* Redis (for statistics storage and mail-server integration)

```
$ npm ci --omit=dev
$ cp config.json.example config.json   # or write config.json yourself, see below
$ npm start -- -c config.json -d       # dry run: nothing is changed
$ npm start -- -c config.json          # or: node src/runCli.js -c config.json
```

Command line options: `-c PATH` config file (default `config.json` in the current
directory), `-d` dry run (nothing is changed in the mailbox and the database),
`-l LEVEL` maximum log level, `-h` help.

Run it on schedule, e.g. hourly from cron:

```
0 * * * * cd /opt/mail-sorter && IMAP_PASSWORD=... node src/runCli.js -c config.json >> /var/log/mail-sorter.log 2>&1
```

### Docker

```
$ docker build -t mail-sorter .
$ docker run --rm -v $PWD/config.json:/app/config.json -e IMAP_PASSWORD=... mail-sorter [-d]
```

### Tests

`npm test`, `npm run lint`. Redis tests run only when `REDIS_URL` is set, e.g.
`REDIS_URL=redis://localhost:6379/15 npm test`. **That database is flushed**, so
use a separate Redis instance.

## Database drivers

mail-sorter can be started directly or through your custom wrapper. It depends on your
address database format. Three database drivers are built in. `config.database` can
also be an array of drivers: an address is then excluded from every database.

### MySQL driver
Allows to work with a typical MySQL database with email addresses: one row - one address.
Supports two operations: `update` (set value in row when address is excluded) or `delete`
(row is deleted when address is excluded).
Configuration example (`config.database`):
```json
{
  "type": "mysql",
  "options": {
    "connection": {
      "database": "123",
      "host": "some.hostname",
      "port": "3307",
      "user": "user",
      "password": "password"
    },
    "operation": {
      "type": "update",
      "table": "personal_accounts",
      "searchColumn": "email",
      "modifyColumn": "mailing_disabled",
      "value": 1
    }
  }
}
```

### Mail-server database driver
Excludes addresses through the mail-server HTTP API (`POST /mailings/unsubscribe`,
requires a mail-server version with this endpoint): undeliverable addresses from
all mailings, senders of unsubscribe letters only from mailings with the
`List-Unsubscribe` header (`listUnsubscribe` option of the mailing; mail-server
versions without this option reject such unsubscribe requests with 400).
`apiKey` is the mail-server API key (created with its `api-keys add` command,
sent as `Authorization: Bearer`); it is needed when mail-server checks keys.
Configuration example (`config.database`):
```json
{
  "type": "mail-server",
  "options": {
    "backend": "http://localhost:8000",
    "apiKey": "%{MAIL_SERVER_API_KEY}"
  }
}
```

### Dummy database driver
Performs no actions, except for writing into log. May be useful, when you have no database
or just want to test something. This is the default option when `config.database` is not defined.
Configuration example (`config.database`):
```json
{
  "type": "dummy"
}
```

### Injecting own database drivers
mail-sorter can be `require`'d as a module. In this mode you can extend a built-in list
of database drivers:

```js
const mailSorter = require('path/to/mail-sorter');

class MyDatabaseClass {
  // ...
}

mailSorter.runCli({
  // allows to use "type": "my-database" in config.database
  'my-database': MyDatabaseClass
});
```
This mode is useful for other address database types.

The second argument of `runCli` (and the fifth argument of `run`) allows to pass
ready-made services instead of the ones created from the config:
`{ mailingRepository, addressStatsRepository, mailSender }`.
Writing own database classes is described in the end of this document.

## Configuration

There are two config files: `config.default.json` and `config.json`. The latter
allows to override default parameters. The `config.json` file should be created manually.

Config files are parsed as [JSON5](https://json5.org/) (comments and trailing commas
are allowed) and support:
* `"%{NAME}"` — value of the environment variable `NAME`, `"%{NAME|default}"` — with
  a default value (useful for passwords);
* `"@{path.to.field}"` — value of another config field;
* `"__parent": "base.json"` — inherit from another file (path is relative to the
  current file).

YAML configs are no longer supported.
```js
{
  "actions": {
    "markAsRead": true, // mark as read all handled messages
    "delete": false // delete all handled messages
  },
  "actionsPerType": { // optional: override "actions" for message types
    "HUMAN": { "markAsRead": false }
  },
  "database": [
    {
      "type": "mysql",
      "options": {} // driver options
    }
  ],
  "expungeOnClose": false, // delete messages that were marked for deletion on connection close
  "forwardTo": "someone@example.com", // where to forward messages from humans
  "imapConnection": { // IMAP connection parameters
    "host": "imap.yandex.ru",
    "password": "%{IMAP_PASSWORD}",
    "port": 993,
    "tls": true, // false: plain connection, STARTTLS is used when the server supports it
    "tlsOptions": { "rejectUnauthorized": true }, // optional: Node.js TLS options
    "user": "123"
  },
  "logging": {
    "actionLogFile": "path/to/action_log", // optional: log file for actions only
    "maxLogLevel": "verbose" // max level of messages that will be written to log (stdout)
  },
  "mailer": { // SMTP server settings for forwarding messages
    "from": "noreply@example.com",
    "host": "localhost",
    "port": 587,
    "auth": { "user": "...", "pass": "..." }, // optional
    "secure": false, // optional: true for TLS right away (port 465); otherwise STARTTLS
    "name": "mailing.example.com" // optional: EHLO name; by default the system host name if it is a full domain name, otherwise [127.0.0.1]
  },
  "mailboxes": ["INBOX"], // mailboxes to read
  "maxForwardDays": 7, // max age (in days) for message to be forwarded
  "maxTemporaryFailures": 3, // this amount of temporary failures will lead to address exclusion from database
  "messageBatchSize": 100, // messages are loaded in batches; this is size of such batch
  "readonly": true, // readonly mode: no changes in mailbox, no changes in database
  "redis": { // Redis of mail-server: "url" or "host"/"port"/"db"/"password"
    "url": "redis://localhost:6379/0",
    "prefixes": {} // optional: key prefixes, the same as in mail-server config
  },
  "unsubscribeAdditionalAddress": "unsubscribe" // part of "unsubscribe" address after + sign
}
```

## How it works

### Message types and corresponding actions

#### MAIL_SERVER
Mail server reply, DSN. Usually, these are emails with `multipart/report` MIME-type
(defined in [RFC 6522](https://tools.ietf.org/html/rfc6522)),
but sorter also supports some non-standard formats that are used by some services
(for example, mail.ru). Actions for this message type are the following:
1. All possible information is extracted from message: receiver address, status (error type),
and, optionally, `List-Id` header. First we try to parse message as standard DSN, if that fails,
we fall back to parsing non-standard headers (`x-mailer-daemon-error` and others).
If both methods have failed, the message is **skipped**.
2. Change statistics for receiver address. If error is permanent (status = 5.x.x),
the last status and its date are set. If error is temporary (status = 4.x.x),
error counter is incremented in addition to actions for permanent errors.
3. If the error is permanent or temporary error count has exceeded the threshold,
the address is excluded from mailing database.


#### AUTORESPONDER
Autoresponder message. Detected by headers `auto-submitted`, `x-autoreply`, `x-autogenerated`,
and by "autoreply" in message subject. Such messages are just deleted.

#### UNSUBSCRIBE
Requests to unsubscribe from mailing. Detected by string after `+` in target address.
Example of such address: `noreply+unsubscribe@some.domain`. Action: mark user as unsubscribed.

#### HUMAN
Messages from humans. This category includes not only human messages, but all messages that do not belong
to any of other categories. Such messages are forwarded to address specified in config parameter `forwardTo`.

### Actions on handled messages
If message has been successfully handled (no error and message was not explicitly **skipped**)
then actions are applied according to `actions` config object:
```json
{
  "actions": {
    "callHandler": true,
    "markAsRead": true,
    "delete": false
  }
}
```
* `callHandler` - perform actions according to message type; set this to false to effectively skip messages;
* `delete` - delete message;
* `markAsRead` - mark message as read.

`actionsPerType` overrides these values for particular message types
(`MAIL_SERVER`, `AUTORESPONDER`, `UNSUBSCRIBE`, `HUMAN`), for example to leave
letters from people unread after forwarding them.

### Address database

Sorter does not know anything about database itself - it only works with an object that implements
certain interface. Interface `MailingDatabase`, described as TypeScript:
```ts
interface MailingDatabase {
  // called when processing DSNs
  // returns boolean - whether the address is present in database
  disableEmailsForAddress (address: string, status: string, fullStatus: string): Promise<boolean>;

  // called on unsubscribe mails
  // returns boolean - whether the address is present in database
  unsubscribeAddress (address: string): Promise<boolean>;
}
```

You can implement your own database classes with any custom logic.
