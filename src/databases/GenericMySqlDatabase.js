const { createConnection } = require('mysql');


class GenericMySqlDatabase {
  constructor (config, logger) {
    this.logger = logger;

    if (!config.operation) {
      throw new Error('config.database.operation is not set.');
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

  disableEmailsForAddress (address) {
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
    return this._performOperation(address);
  }

  _disableEmailsForAddress (address) {
    this.logger.debug('Disable emails for address: ' + address);
    return this._performOperation(address);
  }

  _performOperation (address) {
    if (this.readonly) {
      return Promise.resolve(true);
    }

    if (this.operation.type === 'delete') {
      return this._query(`
        DELETE FROM ${this.operation.table}
        WHERE ${this.operation.searchColumn} = ?
      `, [address]).then(queryResult => Boolean(queryResult.affectedRows));
    } else if (this.operation.type === 'update') {
      return this._query(`
        UPDATE ${this.operation.table}
        SET ${this.operation.modifyColumn} = ?
        WHERE ${this.operation.searchColumn} = ?
      `, [this.operation.value, address]).then(queryResult => Boolean(queryResult.affectedRows));
    } else {
      throw new Error('Unsupported operation: ' + this.operation.type);
    }
  }

  _query (...args) {
    return new Promise((resolve, reject) => {
      this.connection.query(...args, (error, results) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      });
    });
  }
}

module.exports = GenericMySqlDatabase;
