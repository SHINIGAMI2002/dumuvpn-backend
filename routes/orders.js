// routes/orders.js
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { Orders } from '../services/database.js'
import { notifyAdminNewOrder } from '../services/mailer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// ── Multer storage ─────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const MAX_MB     = parseInt(process.env.MAX_UPLOAD_MB || '5')

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${uuidv4()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.heic', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowed.includes(ext)) {
      return cb(new Error(`ไฟล์ต้องเป็น JPG, PNG หรือ PDF เท่านั้น`))
    }
    cb(null, true)
  },
})

// ── Plans config ───────────────────────────────────────────────
const PLANS = {
  standard: { price: 59,  days: 30,  label: 'Standard — 1 เดือน' },
  duo:      { price: 99,  days: 60,  label: 'Duo — 2 เดือน' },
}

// ── POST /api/orders ───────────────────────────────────────────
// Body: name, email, contact, plan
// File: slip (optional at submit — required for approval)
router.post('/', upload.single('slip'), async (req, res) => {
  try {
    const { name, email, contact, plan } = req.body

    // Validation
    const errors = []
    if (!name?.trim())         errors.push('กรุณากรอกชื่อ')
    if (!email?.trim())        errors.push('กรุณากรอก email')
    if (!contact?.trim())      errors.push('กรุณากรอก LINE ID หรือ Facebook')
    if (!PLANS[plan])          errors.push(`แพ็กไม่ถูกต้อง (standard / duo)`)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email ไม่ถูกต้อง')

    if (errors.length) {
      return res.status(400).json({ ok: false, errors })
    }

    const id = uuidv4()
    const order = {
      id,
      name:      name.trim(),
      email:     email.trim().toLowerCase(),
      contact:   contact.trim(),
      plan,
      price:     PLANS[plan].price,
      slip_path: req.file ? req.file.filename : null,
    }

    Orders.create(order)

    // ส่ง email แจ้งเจ้าหน้าที่ (ไม่ await เพื่อไม่ให้ช้า)
    notifyAdminNewOrder({ ...order, created_at: new Date().toISOString() })
      .catch(e => console.error('[mailer] notify admin failed:', e.message))

    console.log(`[order] new order ${id} — ${plan} — ${email}`)

    res.status(201).json({
      ok: true,
      orderId: id,
      message: 'รับคำสั่งซื้อแล้ว ทีมงานจะตรวจสอบสลิปและส่ง config ให้ทาง email ภายใน 5 นาที',
    })
  } catch (err) {
    console.error('[order] create error:', err)
    res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ── GET /api/orders/:id — ลูกค้าเช็คสถานะ ────────────────────
router.get('/:id', async (req, res) => {
  const order = Orders.findById(req.params.id)
  if (!order) return res.status(404).json({ ok: false, error: 'ไม่พบคำสั่งซื้อ' })

  // ส่งเฉพาะข้อมูลที่ลูกค้าควรเห็น
  res.json({
    ok: true,
    order: {
      id:         order.id,
      plan:       order.plan,
      price:      order.price,
      status:     order.status,
      created_at: order.created_at,
    },
  })
})

export default router
