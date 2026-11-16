import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';

function mockDb() {
  const statements = [];
  const db = {
    statements,
    prepare(sql) {
      const item = { sql, values: [] };
      statements.push(item);
      return {
        bind(...values) { item.values = values; return this; },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async first() { return { attempts: 1 }; },
        async all() { return { results: [] }; }
      };
    }
  };
  return db;
}

test('Store analytics accepts only allowlisted aggregate events from the Store origin', async () => {
  const DB = mockDb();
  const request = new Request('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/store-analytics', {
    method: 'POST',
    headers: { Origin: 'https://pakthai-tech-store.pages.dev', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
    body: JSON.stringify({ event: 'page_view' })
  });
  const response = await worker.fetch(request, { DB });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  const insert = DB.statements.find(x => x.sql.includes('INSERT INTO store_analytics_events'));
  assert.ok(insert, 'event count should be aggregated in D1');
  assert.deepEqual(insert.values.slice(1, 2), ['page_view']);
  assert.ok(!DB.statements.some(x => x.values.some(v => typeof v === 'string' && v.includes('192.0.2.10'))), 'raw IP must not be persisted');
});

test('Store analytics rejects unapproved origins and arbitrary payload fields', async () => {
  const originDb = mockDb();
  const wrongOrigin = await worker.fetch(new Request('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/store-analytics', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'page_view' })
  }), { DB: originDb });
  assert.equal(wrongOrigin.status, 403);

  const payloadDb = mockDb();
  const rawSearch = await worker.fetch(new Request('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/store-analytics', {
    method: 'POST', headers: { Origin: 'https://pakthai-tech-store.pages.dev', 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'product_search', query: 'private search' })
  }), { DB: payloadDb });
  assert.equal(rawSearch.status, 400);
  assert.ok(!payloadDb.statements.some(x => x.sql.includes('INSERT INTO store_analytics_events')));
});

test('Store analytics summary requires an Owner session', async () => {
  const DB = mockDb();
  const response = await worker.fetch(new Request('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/store-analytics'), { DB });
  assert.equal(response.status, 401);
});
