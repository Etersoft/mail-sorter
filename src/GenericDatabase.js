const { createConnection } = require('mysql');


class GenericDatabase {
  constructor (config, logger) {
    this.logger = logger;

    if (!config.operation) {
      throw new Error('config.database.operation is not set.');
    }

    if (config.driver !== 'mysql') {
      throw new Error('The only supported config.database.driver value is "mysql"');
    }

    this.operation = config.operation;

    if (!this.operation.table) {
      throw new Error('config.database.operation.table is not set.');
    }

    if (!this.operation.searchColumn) {
      throw new Error('config.database.operation.searchColumn is not set.');
    }

    this.readonly = config.readonly;
    if (!config.readonly) {
      this.connection = createConnection(config.connection);
    } else {
      logger.info('No database connection established: dry run');
    }
  }

  disableEmailsForAddress (address, status, fullStatus) {
    this.logger.debug('Disable emails: ' + address);
    if (this.readonly) {
      return Promise.resolve(true);
    }
    return this._disableEmailsForAddress(address).then(queryResult => {
      return Boolean(queryResult.affectedRows);
    });
  }

  unsubscribeAddress (address) {
    this.logger.debug('Unsubscribe emails: ' + address);
    const result = {
      performedActions: ['unsubscribe'],
      reason: `Unsubscribe email received`,
      skipped: false
    };
    if (this.readonly) {
      return Promise.resolve(result);
    }
    return this._query(`
      DELETE FROM ${this.operation.table}
      WHERE ${this.operation.searchColumn} = ?
    `, [address]).then(queryResult => {
      if (!queryResult.affectedRows) {
        return {
          reason: `Email not found in database (${address})`,
          skipped: true
        };
      }
      return result;
    });
  }

  _disableEmailsForAddress (address) {
    return this._query(`
      DELETE FROM ${this.operation.table}
      WHERE ${this.operation.searchColumn} = ?
    `, [address]);
  }

  _query (...args) {
    return new Promise((resolve, reject) => {
      this.connection.query(...args, (error, results, fields) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      });
    });
  }
}

module.exports = GenericDatabase;
