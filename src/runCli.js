#!/usr/bin/env node
const { dirname, join } = require('node:path');
const { parseArgs } = require('node:util');

const { deepMerge, readConfig } = require('./readConfig');


const USAGE = `Usage: mail-sorter [-d] [-h] [-l LEVEL] [-c path/to/config.json]

Options:
  -d, --dry            Dry run: do not modify database and mailbox
  -l, --loglevel LEVEL Sets maximum log level
  -c, --config PATH    Sets custom config (default: config.json)
  -h, --help           Show help`;

// eslint-disable-next-line max-statements
module.exports = function (additionalDbDrivers = {}, services = {}) {
  // Parse CLI args before loading any other modules
  const { values: argv } = parseArgs({
    options: {
      config: { short: 'c', type: 'string' },
      dry: { short: 'd', type: 'boolean' },
      help: { short: 'h', type: 'boolean' },
      loglevel: { short: 'l', type: 'string' }
    }
  });
  if (argv.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const cliOptions = {
    logging: argv.loglevel ? {
      maxLogLevel: argv.loglevel
    } : {}
  };

  if (argv.dry) {
    cliOptions.readonly = true;
  }

  const createLogger = require('./logger');
  const defaultConfig = join(dirname(__dirname), 'config.default.json');
  const configFilename = argv.config || 'config.json';
  const GenericMySqlDatabase = require('./databases/GenericMySqlDatabase');
  const MultiDatabase = require('./databases/MultiDatabase');
  const MailServerDatabase = require('./databases/MailServerDatabase');
  const DummyDatabase = require('./databases/DummyDatabase');


  const BUILTIN_DATABASES = {
    dummy: DummyDatabase,
    'mail-server': MailServerDatabase,
    mysql: GenericMySqlDatabase
  };

  function createDatabase (config, logger) {
    const databaseMap = Object.assign({}, BUILTIN_DATABASES, additionalDbDrivers);
    const Database = (config && config.type) ? databaseMap[config.type] : DummyDatabase;
    if (!Database) {
      throw new Error('Unknown database type: ' + config.type);
    }
    return new Database(Object.assign({}, config.options, {
      readonly: cliOptions.readonly || false
    }), logger);
  }

  const config = deepMerge(readConfig([defaultConfig, configFilename]), cliOptions);
  const logger = createLogger(config.logging);
  let actionLogger = null;
  if (config.logging.actionLogFile) {
    actionLogger = createLogger({
      colors: false,
      file: config.logging.actionLogFile,
      levels: false,
      timestamp: true
    });
  }
  const database = Array.isArray(config.database) ? new MultiDatabase(
    config.database.map(d => createDatabase(d, logger))
  ) : createDatabase(config.database, logger);
  require('./runSorter')(config, logger, actionLogger, database, services).then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
};

if (require.main === module) {
  module.exports();
}
