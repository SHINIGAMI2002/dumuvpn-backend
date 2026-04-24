// server.js — dumuVPN Backend
import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import fs from 'fs'

import orderRoutes from './routes/orders.js'
import adminRoutes from './routes/admin.js'
import { verifyConnection } from './services/mailer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app  = express()
const PORT = parseInt(process.env.PORT || '3000')

// ── Ensure uploads dir exists ─────────────────────────────────
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true })

// ── Middleware ────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS — allow frontend origin
app.use((req, res, next) => {
  const allowed = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean)
  const origin  = req.headers.origin
  if (!origin || allowed.includes(origin) || allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Secret')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Rate limit — order submit: 10 req / 15 min per IP
app.use('/api/orders', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
}))

// ── Routes ────────────────────────────────────────────────────
app.use('/api/orders', orderRoutes)
app.use('/admin',      adminRoutes)

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok:      true,
    service: 'dumuVPN Backend',
    version: '1.0.0',
    time:    new Date().toISOString(),
  })
})

// ── Serve frontend (optional) ─────────────────────────────────
// ถ้าวาง dumuVPN.html ไว้ใน public/ จะเสิร์ฟให้อัตโนมัติ
const publicDir = path.join(__dirname, 'public')
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir))
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', err.message)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: `ไฟล์ใหญ่เกินไป (สูงสุด ${process.env.MAX_UPLOAD_MB || 5}MB)` })
  }
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Internal server error' })
})

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n✅ dumuVPN Backend running on port ${PORT}`)
  console.log(`   Health:  http://localhost:${PORT}/health`)
  console.log(`   3x-ui:   ${process.env.XRAY_PANEL_URL}`)
  console.log(`   Admin:   http://localhost:${PORT}/admin/orders?secret=YOUR_SECRET`)
  console.log(`   Env:     ${process.env.NODE_ENV}\n`)

  // ตรวจสอบ SMTP connection
  try {
    await verifyConnection()
  } catch (e) {
    console.warn('[mailer] SMTP not ready:', e.message)
    console.warn('         ตรวจสอบ SMTP_USER / SMTP_PASS ใน .env\n')
  }
})

export default app
