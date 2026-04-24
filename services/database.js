// services/database.js
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'orders.db')

// สร้าง directory ถ้ายังไม่มี
import fs from 'fs'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    contact     TEXT NOT NULL,
    plan        TEXT NOT NULL CHECK(plan IN ('standard','duo')),
    price       INTEGER NOT NULL,
    slip_path   TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','approved','rejected','provisioned','failed')),
    xray_uuid   TEXT,
    xray_email  TEXT,
    note        TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_email  ON orders(email);
`)

// ── Helpers ──────────────────────────────────────────────────────
export const Orders = {
  create(data) {
    return db.prepare(`
      INSERT INTO orders (id, name, email, contact, plan, price, slip_path)
      VALUES (@id, @name, @email, @contact, @plan, @price, @slip_path)
    `).run(data)
  },

  findById(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  },

  findAll({ status, limit = 50, offset = 0 } = {}) {
    if (status) {
      return db.prepare(
        'SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(status, limit, offset)
    }
    return db.prepare(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset)
  },

  updateStatus(id, status, extra = {}) {
    const sets = ['status = @status', 'updated_at = CURRENT_TIMESTAMP']
    const params = { id, status }

    if (extra.xray_uuid)  { sets.push('xray_uuid = @xray_uuid');   params.xray_uuid  = extra.xray_uuid  }
    if (extra.xray_email) { sets.push('xray_email = @xray_email'); params.xray_email = extra.xray_email }
    if (extra.note)       { sets.push('note = @note');             params.note       = extra.note       }

    return db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = @id`).run(params)
  },

  count(status) {
    const row = status
      ? db.prepare('SELECT COUNT(*) as n FROM orders WHERE status = ?').get(status)
      : db.prepare('SELECT COUNT(*) as n FROM orders').get()
    return row.n
  },
}

export default db
