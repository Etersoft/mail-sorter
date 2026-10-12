const { createClient, WatchError } = require('redis');


// Ключи и формат данных совпадают с хранилищем mail-server
// (RedisMailingRepository и RedisAddressStatsRepository), префиксы
// настраиваются так же — через redis.prefixes
const DEFAULT_PREFIXES = {
  addressStatsKeyPrefix: 'ADDRESS_STATS_',
  commonDataKeyPrefix: 'MAILING_COMMON_DATA_',
  idCounterKey: 'MAILING_ID_COUNTER'
};

// Переводит параметры клиента redis 2.x (как в конфиге mail-server)
// в формат node-redis 4+
function createRedisClient (config) {
  const options = {
    database: config.db,
    password: config.password,
    url: config.url
  };
  if (!config.url) {
    options.socket = {
      host: config.host,
      path: config.path,
      port: config.port
    };
  }
  return createClient(options);
}

// Оптимистичная блокировка через WATCH/MULTI: читает JSON по ключу, даёт
// сценарию изменить объект и записывает его обратно. Если ключ изменился
// между чтением и записью, всё повторяется. Нужно отдельное соединение,
// в котором команды выполняются последовательно
async function updateJsonInTransaction (client, key, scenario) {
  for (;;) {
    await client.watch(key);
    const json = await client.get(key);
    if (!json) {
      await client.unwatch();
      return null;
    }
    const object = JSON.parse(json);
    await scenario(object);
    try {
      const result = await client.multi().set(key, JSON.stringify(object)).exec();
      if (result !== null) {
        return object;
      }
    } catch (error) {
      if (!(error instanceof WatchError)) {
        throw error;
      }
    }
  }
}

class RedisAddressStatsRepository {
  constructor (client, prefixes = {}) {
    this.client = client;
    this.prefix = prefixes.addressStatsKeyPrefix || DEFAULT_PREFIXES.addressStatsKeyPrefix;
  }

  async create (properties) {
    const stats = normalizeStats(properties);
    await this.client.set(this.prefix + stats.email, JSON.stringify(stats));
    return stats;
  }

  async getByEmail (email) {
    const json = await this.client.get(this.prefix + email);
    return json ? normalizeStats(JSON.parse(json)) : null;
  }

  async updateInTransaction (email, scenario) {
    return updateJsonInTransaction(this.client, this.prefix + email, async object => {
      const stats = normalizeStats(object);
      await scenario(stats);
      Object.assign(object, stats);
    });
  }
}

// Значения по умолчанию те же, что у AddressStats в mail-server
function normalizeStats (properties) {
  return {
    ...properties,
    spam: Boolean(properties.spam),
    temporaryFailureCount: properties.temporaryFailureCount || 0
  };
}

class RedisMailingRepository {
  constructor (client, prefixes = {}) {
    this.client = client;
    this.commonDataKeyPrefix = prefixes.commonDataKeyPrefix ||
      DEFAULT_PREFIXES.commonDataKeyPrefix;
    this.idCounterKey = prefixes.idCounterKey || DEFAULT_PREFIXES.idCounterKey;
  }

  async getByListId (listId) {
    const maxId = Number(await this.client.get(this.idCounterKey));
    const keys = await this.client.keys(this.commonDataKeyPrefix + '*');
    if (!keys.length) {
      return null;
    }
    const data = await this.client.mGet(keys);
    for (let i = 0; i < keys.length; i++) {
      const id = Number(keys[i].slice(this.commonDataKeyPrefix.length));
      if (!data[i] || id > maxId) {
        continue;
      }
      const mailing = JSON.parse(data[i]);
      if (mailing.listId === listId) {
        return { ...mailing, id };
      }
    }
    return null;
  }

  async updateInTransaction (id, scenario) {
    const mailing = await updateJsonInTransaction(
      this.client, this.commonDataKeyPrefix + id, scenario
    );
    return mailing ? { ...mailing, id } : null;
  }
}

module.exports = {
  createRedisClient,
  RedisAddressStatsRepository,
  RedisMailingRepository
};
