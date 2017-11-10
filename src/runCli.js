module.exports = function (Database) {
  const { dirname, join } = require('path');
  const yargs = require('yargs');
  // Parse CLI args before loading any other modules
  const argv = yargs
    .usage('Usage: $0 [-d] [-h]')
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
    .version(false)
    .help('help')
    .alias('help', 'h')
    .argv;

  const cliOptions = {
    database: {
      readonly: argv.dry
    },
    logging: argv.loglevel ? {
      maxLogLevel: argv.loglevel
    } : {},
    readonly: argv.dry
  };


  const readConfig = require('read-config');
  const createLogger = require('logger');
  const defaultConfig = join(dirname(__dirname), 'config.default.json');

  const config = readConfig([defaultConfig, 'config.json', cliOptions]);
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
  const database = new Database(config.database, logger);
  require('./runSorter')(config, logger, actionLogger, database).then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
};
