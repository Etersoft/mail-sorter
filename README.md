# mail-sorter

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

## Installation and setup

You will need:
* Node.js
* Redis (for statistics storage and mail-server integration)

mail-sorter can be started directly or through your custom wrapper. It depends on your
address database format. Three database drivers are built in.

#### MySQL driver
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

#### Mail-server database driver
Allows to work with mail-server database in Redis. Configuration example (`config.database`):
```json
{
  "type": "mail-server",
  "options": {
    "backend": "http://localhost:8000"
  }
}
```

#### Dummy database driver
Performs no actions, except for writing into log. May be useful, when you have no database
or just want to test something. This is the default option when `config.database` is not defined.
Configuration example (`config.database`):
```json
{
  "type": "dummy"
}
```

#### Injecting own database drivers
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
Writing own database classes is described in the end of this document.

### Configuration

There are two config files: `config.default.json` and `config.json`. The latter
allows to override default parameters. The `config.json` file should be created manually.
```js
{
  "actions": {
    "markAsRead": true, // mark as read all handled messages
    "delete": false // delete all handled messages
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
    "password": "123",
    "port": 993,
    "tls": true,
    "user": "123"
  },
  "logging": {
    "actionLogFile": "path/to/action_log", // optional: log file for actions only
    "maxLogLevel": "verbose" // max level of messages that will be written to log (stdout)
  },
  "mailer": { // SMTP server settings for forwarding messages
    "host": "localhost",
    "port": 587
  },
  "mailboxes": ["INBOX"], // mailboxes to read
  "maxForwardDays": 7, // max age (in days) for message to be forwarded
  "maxTemporaryFailures": 3, // this amount of temporary failures will lead to address exclusion from database
  "messageBatchSize": 100, // messages are loaded in batches; this is size of such batch
  "readonly": true, // readonly mode: no changes in mailbox, no changes in database
  "redis": { // redis connection parameters
    "pool": { // min and max number of connections in pool
      "min": 1,
      "max": 5
    }
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
