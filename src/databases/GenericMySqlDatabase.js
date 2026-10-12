const mysql = require('mysql2');


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
      this.connection = mysql.createConnection(config.connection);
    } else {
      logger.info('No database connection established: dry run');
    }
  }

  async disableEmailsForAddress (address) {
    this.logger.debug('Disable emails: ' + address);
    if (this.readonly) {
      return true;
    }
    const queryResult = await this._disableEmailsForAddress(address);
    return Boolean(queryResult.affectedRows);
  }

  async unsubscribeAddress (address) {
    this.logger.debug('Unsubscribe emails: ' + address);
    return this._performOperation(address);
  }

  async _disableEmailsForAddress (address) {
    this.logger.debug('Disable emails for address: ' + address);
    return this._performOperation(address);
  }

  async _performOperation (address) {
    if (this.readonly) {
      return true;
    }

    if (this.operation.type === 'delete') {
      const queryResult = await this._query(`
        DELETE FROM ${this.operation.table}
        WHERE ${this.operation.searchColumn} = ?
      `, [address]);
      return Boolean(queryResult.affectedRows);
    } else if (this.operation.type === 'update') {
      const queryResult = await this._query(`
        UPDATE ${this.operation.table}
        SET ${this.operation.modifyColumn} = ?
        WHERE ${this.operation.searchColumn} = ?
      `, [this.operation.value, address]);
      return Boolean(queryResult.affectedRows);
    } else {
      throw new Error('Unsupported operation: ' + this.operation.type);
    }
  }

  _query (sql, params) {
    return new Promise((resolve, reject) => {
      this.connection.query(sql, params, (error, results) => {
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
