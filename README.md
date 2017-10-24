# Common part of mailbox sorter
Public API:
- run (config, logger, database)
Sorts all unread messages in mailbox.
Options:
  - config: configuration for mailbox sorter. Example config:
  ```
  {
    "failedAddressesFile": "failed.txt",
    "imapConnection": {
      "host": "imap.yandex.ru",
      "password": "1234",
      "port": 993,
      "tls": true,
      "user": "noreply@youngreaders.ru"
    },
    "logging": {
      "maxLogLevel": "verbose"
    },
    "messageBatchSize": 100,
    "unsubscribeAdditionalAddress": "unsubscribe",
    "unsubscribedAddressesFile": "unsubscribed.txt"
  }
  ```
  - logger (optional): an external logger. Must have 6 logging methods defined:
  `error`, `warn`, `info`, `verbose`, `debug`, `silly`
  If not passed, a default logger will be used, with config values from "logging" object.
  - database (optional): a database access object. Must have two methods defined:
    - setAddressStatus (address: string, status: number): Promise
    Is called for mail server replies. Status can be 1 or 2 (see `ReplyStatuses` below).
    - unsubscribeAddress (address: string): Promise
    Is called for each mail that has a `+unsubscribe` address.

- ReplyStatuses. Object with two properties:
  - INVALID_ADDRESS: 1 (5.*.* statuses, these indicate that address can be immediately removed from mailing list)
  - TEMPORARY_FAILURE: 2 (4.*.* statuses, indicate temporary failures)
