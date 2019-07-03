class MultiDatabase {
  constructor (databases) {
    this.databases = databases;
  }

  async disableEmailsForAddress (address, status, fullStatus) {
    let result = false;
    for (const db of this.databases) {
      if (await db.disableEmailsForAddress(address, status, fullStatus)) {
        result = true;
      }
    }
    return result;
  }

  async unsubscribeAddress (address) {
    const actions = [];
    let skipped = true;
    for (const db of this.databases) {
      const dbResult = await db.unsubscribeAddress(address);
      if (!dbResult.skipped) {
        skipped = false;
        actions.push(...dbResult.performedActions);
      }
    }

    return {
      performedActions: actions,
      skipped
    };
  }
}

module.exports = MultiDatabase;
