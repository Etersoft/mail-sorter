const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  createRedisClient, RedisAddressStatsRepository, RedisMailingRepository,
  RedisSorterStatusRepository
} = require('../src/services/RedisRepositories');


// Нужен работающий Redis: REDIS_URL=redis://localhost:6379/15 npm test
// Тест очищает выбранную базу
const REDIS_URL = process.env.REDIS_URL;

describe('Redis repositories', { skip: !REDIS_URL && 'REDIS_URL is not set' }, function () {
  let client;

  before(async function () {
    client = createRedisClient({ url: REDIS_URL });
    await client.connect();
  });

  after(async function () {
    await client.close();
  });

  beforeEach(async function () {
    await client.flushDb();
  });

  it('should create, read and update address stats', async function () {
    const repository = new RedisAddressStatsRepository(client);
    await repository.create({ email: 'a@example.com', lastStatus: '5.0.0' });
    assert.equal(
      JSON.parse(await client.get('ADDRESS_STATS_a@example.com')).lastStatus, '5.0.0'
    );

    const updated = await repository.updateInTransaction('a@example.com', async stats => {
      stats.temporaryFailureCount++;
      stats.lastStatusDate = new Date('2026-01-01T00:00:00Z');
    });
    assert.equal(updated.temporaryFailureCount, 1);

    const stats = await repository.getByEmail('a@example.com');
    assert.equal(stats.temporaryFailureCount, 1);
    assert.equal(stats.spam, false);
    assert.equal(stats.lastStatusDate, '2026-01-01T00:00:00.000Z');
  });

  it('should return null when updating missing address stats', async function () {
    const repository = new RedisAddressStatsRepository(client);
    assert.equal(await repository.updateInTransaction('none@example.com', () => {}), null);
    assert.equal(await repository.getByEmail('none@example.com'), null);
  });

  it('should find mailing by list-id and update it keeping other fields', async function () {
    await client.set('MAILING_ID_COUNTER', '2');
    await client.set('MAILING_COMMON_DATA_1', JSON.stringify({ listId: '<a>', name: 'A' }));
    await client.set('MAILING_COMMON_DATA_2', JSON.stringify({
      listId: '<b>', name: 'B', undeliveredCount: 5
    }));
    // id больше счётчика — недосозданная рассылка, mail-server её не видит
    await client.set('MAILING_COMMON_DATA_3', JSON.stringify({ listId: '<c>' }));

    const repository = new RedisMailingRepository(client);
    assert.equal((await repository.getByListId('<b>')).id, 2);
    assert.equal(await repository.getByListId('<c>'), null);
    assert.equal(await repository.getByListId('<none>'), null);

    const mailing = await repository.updateInTransaction(2, async m => {
      m.undeliveredCount++;
    });
    assert.equal(mailing.undeliveredCount, 6);
    assert.deepEqual(JSON.parse(await client.get('MAILING_COMMON_DATA_2')), {
      listId: '<b>', name: 'B', undeliveredCount: 6
    });
  });

  it('should retry transaction when the key changes concurrently', async function () {
    await client.set('ADDRESS_STATS_r@example.com', JSON.stringify({ email: 'r@example.com' }));
    const other = client.duplicate();
    await other.connect();
    try {
      const repository = new RedisAddressStatsRepository(client);
      let attempts = 0;
      const stats = await repository.updateInTransaction('r@example.com', async s => {
        attempts++;
        if (attempts === 1) {
          await other.set('ADDRESS_STATS_r@example.com', JSON.stringify({
            email: 'r@example.com', temporaryFailureCount: 10
          }));
        }
        s.temporaryFailureCount++;
      });
      assert.equal(attempts, 2);
      assert.equal(stats.temporaryFailureCount, 11);
    } finally {
      await other.close();
    }
  });

  it('should save sorter status keeping the last success time', async function () {
    const repository = new RedisSorterStatusRepository(client);
    assert.equal(await repository.get(), null);

    await repository.save({ finishedAt: '2026-10-30T10:00:00.000Z', success: true });
    const failed = await repository.save({
      error: 'connect ECONNREFUSED', finishedAt: '2026-10-30T11:00:00.000Z', success: false
    });
    assert.equal(failed.lastSuccessAt, '2026-10-30T10:00:00.000Z');
    assert.deepEqual(JSON.parse(await client.get('MAIL_SORTER_STATUS')), failed);
  });
});
