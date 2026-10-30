// The database layer behaves the same on both back ends: local SQLite file and libSQL (Turso protocol, here a local file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../server/config.mjs';
import { openDb, closeDb, getDb, tx, migrate, splitSql, dbKind } from '../server/db.mjs';

for (const kind of ['file', 'libsql']) {
  test(`database layer (${kind}): statements, transactions, rollback, isolation`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rookery-db-'));
    config.dataDir = dir; config.dbFile = join(dir, 'x.db'); config.tursoUrl = kind === 'libsql' ? `file:${join(dir, 't.db')}` : '';
    try {
      await openDb();
      assert.equal(dbKind(), kind === 'libsql' ? 'turso' : 'file');
      await migrate();
      const d = getDb();
      await d.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
      const ins = await d.prepare('INSERT INTO t(v) VALUES (?)').run('a');
      assert.equal(ins.changes, 1); assert.equal(typeof ins.lastInsertRowid, 'number');
      assert.deepEqual(await d.prepare('SELECT v FROM t').all(), [{ v: 'a' }]);
      assert.equal((await d.prepare('SELECT count(*) n FROM t').get()).n, 1);
      assert.equal(await d.prepare('SELECT v FROM t WHERE id = 99').get(), undefined);

      // rollback: nothing from a failed transaction is kept, even through helpers that call getDb()
      const helper = async () => getDb().prepare('INSERT INTO t(v) VALUES (?)').run('inside');
      await assert.rejects(tx(async () => { await helper(); throw new Error('boom'); }), /boom/);
      assert.equal((await d.prepare('SELECT count(*) n FROM t').get()).n, 1);
      // commit
      await tx(async () => { await helper(); });
      assert.equal((await d.prepare('SELECT count(*) n FROM t').get()).n, 2);

      // isolation: a statement issued by someone else while a transaction is open waits and never joins it
      let release; const gate = new Promise((r) => { release = r; });
      const slow = tx(async () => { await helper(); await gate; throw new Error('abort'); });
      await new Promise((r) => setTimeout(r, 30));
      const other = d.prepare('INSERT INTO t(v) VALUES (?)').run('outside');
      release(); await assert.rejects(slow, /abort/); await other;
      assert.deepEqual((await d.prepare("SELECT v FROM t WHERE v IN ('inside','outside') ORDER BY id").all()).map((r) => r.v), ['inside', 'outside']);
      assert.equal((await d.prepare('SELECT count(*) n FROM t WHERE v = ?').get('inside')).n, 1, 'only the committed "inside" row from before survives; the aborted one is gone');
    } finally { await closeDb(); rmSync(dir, { recursive: true, force: true }); }
  });
}

test('splitSql keeps semicolons and dashes inside quoted text', () => {
  assert.deepEqual(splitSql("CREATE TABLE a(x TEXT DEFAULT 'a;b -- c'); -- note\nINSERT INTO a VALUES('it''s;');"), ["CREATE TABLE a(x TEXT DEFAULT 'a;b -- c')", "INSERT INTO a VALUES('it''s;')"]);
});
