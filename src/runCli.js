module.exports = function (additionalDbDrivers = {}) {
  const { dirname, join } = require('path');
  const yargs = require('yargs');
  // Parse CLI args before loading any other modules
  const argv = yargs
    .usage('Usage: $0 [-d] [-h] [-c path/to/config.json]')
    .option('dry', {
      alias: 'd',
      boolean: true,
      describe: 'Dry run: do not modify database and mailbox'
    })
    .option('loglevel', {
      alias: 'l',
      describe: 'Sets maximum log level',
      string: true
    })
    .option('config', {
      alias: 'c',
      describe: 'Sets custom config',
      string: true
    })
    .version(false)
    .help('help')
    .alias('help', 'h')
    .argv;

  const cliOptions = {
    database: {
      options: {
        readonly: argv.dry
      }
    },
    logging: argv.loglevel ? {
      maxLogLevel: argv.loglevel
    } : {},
  };
  
  if (argv.dry) {
    cliOptions.readonly = true;
  }

  const readConfig = require('read-config');
  const { merge } = require('lodash');
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
    return new Database(config.options, logger);
  }

  const config = merge(readConfig([defaultConfig, configFilename]), cliOptions);
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
    config.map(d => createDatabase(d, logger))
  ) : createDatabase(config.database, logger);
  require('./runSorter')(config, logger, actionLogger, database).then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
};

if (require.main === module) {
  module.exports();
}
