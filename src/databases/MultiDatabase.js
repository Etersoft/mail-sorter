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

  // Как и драйверы, возвращает true, если адрес найден хотя бы в одной базе
  async unsubscribeAddress (address) {
    let result = false;
    for (const db of this.databases) {
      if (await db.unsubscribeAddress(address)) {
        result = true;
      }
    }
    return result;
  }
}

module.exports = MultiDatabase;
