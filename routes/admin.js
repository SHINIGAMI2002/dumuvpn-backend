// routes/admin.js
import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { Orders } from '../services/database.js'
import { addClient, genVlessLink } from '../services/xray.js'
import { sendConfigToCustomer, notifyRejected } from '../services/mailer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router    = Router()
const SECRET    = process.env.ADMIN_SECRET || ''

// ── Secret middleware ──────────────────────────────────────────
function checkSecret(req, res, next) {
  const secret = req.query.secret || req.headers['x-admin-secret'] || req.body?.secret
  if (!SECRET || secret !== SECRET) {
    return res.status(403).json({ ok: false, error: 'Forbidden' })
  }
  next()
}

// ── GET /admin/orders — list all orders ───────────────────────
router.get('/orders', checkSecret, (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query
  const orders = Orders.findAll({ status, limit: parseInt(limit), offset: parseInt(offset) })
  const total  = Orders.count(status)
  res.json({ ok: true, orders, total })
})

// ── GET /admin/orders/:id — single order detail ───────────────
router.get('/orders/:id', checkSecret, (req, res) => {
  const order = Orders.findById(req.params.id)
  if (!order) return res.status(404).json({ ok: false, error: 'Not found' })
  res.json({ ok: true, order })
})

// ── POST /admin/approve/:id — approve order ───────────────────
// ขั้นตอน: validate → สร้าง xray client → ส่ง email → update DB
router.get('/approve/:id', checkSecret, async (req, res) => {
  await handleApprove(req, res)
})
router.post('/approve/:id', checkSecret, async (req, res) => {
  await handleApprove(req, res)
})

async function handleApprove(req, res) {
  const order = Orders.findById(req.params.id)

  if (!order) {
    return res.status(404).send(htmlMsg('❌ ไม่พบ Order', `Order ID: ${req.params.id} ไม่มีในระบบ`))
  }

  if (order.status === 'provisioned') {
    return res.send(htmlMsg('✅ ทำไปแล้ว', `Order ${order.id} ถูก approve และสร้าง config ไปแล้ว`))
  }

  if (!['pending', 'approved'].includes(order.status)) {
    return res.status(400).send(htmlMsg('⚠️ ไม่สามารถ Approve ได้', `สถานะปัจจุบัน: ${order.status}`))
  }

  try {
    // 1. กำหนด xray email (unique)
    const xrayEmail = `${order.id.slice(0, 8)}-${order.plan}`
    const uuid      = uuidv4()
    const days      = order.plan === 'standard' ? 30 : 60

    // 2. สร้าง client ใน 3x-ui
    await addClient({
      uuid,
      email:     xrayEmail,
      limitGB:   0,          // unlimited
      expiryDays: days,
    })

    // 3. สร้าง VLESS link
    const serverHost = new URL(process.env.XRAY_PANEL_URL || 'http://localhost').hostname
    const vlessLink  = await genVlessLink({ uuid, email: xrayEmail, serverHost })

    // 4. อัพเดต DB
    Orders.updateStatus(order.id, 'provisioned', {
      xray_uuid:  uuid,
      xray_email: xrayEmail,
    })

    // 5. ส่ง config ให้ลูกค้า
    await sendConfigToCustomer(order, vlessLink)

    console.log(`[admin] approved: ${order.id} → xray_email=${xrayEmail}`)

    return res.send(htmlMsg(
      '✅ Approved!',
      `Order: ${order.id}<br>
       ลูกค้า: ${order.name} (${order.email})<br>
       UUID: <code>${uuid}</code><br>
       ส่ง email config แล้วเรียบร้อย`
    ))
  } catch (err) {
    console.error('[admin] approve error:', err)
    Orders.updateStatus(order.id, 'failed', { note: err.message })
    return res.status(500).send(htmlMsg(
      '❌ เกิดข้อผิดพลาด',
      `${err.message}<br><br>Order ถูก mark เป็น <strong>failed</strong> กรุณาตรวจสอบ log และ retry`
    ))
  }
}

// ── POST /admin/reject/:id ────────────────────────────────────
router.get('/reject/:id', checkSecret, async (req, res) => {
  await handleReject(req, res)
})
router.post('/reject/:id', checkSecret, async (req, res) => {
  await handleReject(req, res)
})

async function handleReject(req, res) {
  const order  = Orders.findById(req.params.id)
  const reason = req.body?.reason || req.query.reason || ''

  if (!order) {
    return res.status(404).send(htmlMsg('❌ ไม่พบ Order', `Order ID: ${req.params.id}`))
  }

  if (order.status === 'provisioned') {
    return res.status(400).send(htmlMsg('⚠️ Approve ไปแล้ว', 'ไม่สามารถ reject order ที่ provisioned แล้วได้'))
  }

  Orders.updateStatus(order.id, 'rejected', { note: reason })

  // แจ้งลูกค้า (ถ้ามี email)
  notifyRejected(order, reason)
    .catch(e => console.error('[mailer] reject notify failed:', e.message))

  console.log(`[admin] rejected: ${order.id}`)

  return res.send(htmlMsg(
    '🚫 Rejected',
    `Order: ${order.id}<br>ลูกค้า: ${order.name}<br>ส่ง email แจ้งลูกค้าแล้ว`
  ))
}

// ── GET /admin/slip/:id — ดูไฟล์สลิป ────────────────────────
router.get('/slip/:id', checkSecret, (req, res) => {
  const order = Orders.findById(req.params.id)
  if (!order || !order.slip_path) {
    return res.status(404).send(htmlMsg('❌ ไม่พบสลิป', 'Order นี้ยังไม่มีสลิปแนบ'))
  }
  const filePath = path.join(__dirname, '..', 'uploads', order.slip_path)
  res.sendFile(filePath)
})

// ── GET /admin/stats — dashboard summary ─────────────────────
router.get('/stats', checkSecret, (req, res) => {
  res.json({
    ok: true,
    stats: {
      total:       Orders.count(),
      pending:     Orders.count('pending'),
      approved:    Orders.count('approved'),
      provisioned: Orders.count('provisioned'),
      rejected:    Orders.count('rejected'),
      failed:      Orders.count('failed'),
    },
  })
})

// ── Simple HTML response helper ───────────────────────────────
function htmlMsg(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:12px;padding:36px 40px;max-width:480px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h2{margin:0 0 16px;font-size:20px}p{color:#555;line-height:1.7;font-size:14px}code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:12px}
.back{display:inline-block;margin-top:20px;font-size:13px;color:#888}
</style></head><body>
<div class="card"><h2>${title}</h2><p>${body}</p>
<a class="back" href="javascript:history.back()">← กลับ</a></div></body></html>`
}

export default router
