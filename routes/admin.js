import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Orders } from '../services/database.js'
import { sendConfigToCustomer, notifyRejected } from '../services/mailer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router    = Router()
const SECRET    = process.env.ADMIN_SECRET || ''
const STOCK_PATH = path.join(__dirname, '..', 'data', 'stock.json')

// Helper: อ่าน/เขียน Stock
const getStock = () => JSON.parse(fs.readFileSync(STOCK_PATH, 'utf8'))
const saveStock = (data) => fs.writeFileSync(STOCK_PATH, JSON.stringify(data, null, 2))

function checkSecret(req, res, next) {
  const secret = req.query.secret || req.headers['x-admin-secret'] || req.body?.secret
  if (!SECRET || secret !== SECRET) return res.status(403).json({ ok: false, error: 'Forbidden' })
  next()
}

// API สำหรับหน้าบ้านดึงไปโชว์ว่าเหลือของกี่ชิ้น
router.get('/stock-count', (req, res) => {
  try {
    const stock = getStock()
    const counts = {
      standard: stock.filter(i => i.plan === 'standard' && !i.isUsed).length,
      duo: stock.filter(i => i.plan === 'duo' && !i.isUsed).length
    }
    res.json({ ok: true, counts })
  } catch (err) { res.json({ ok: false, counts: { standard: 0, duo: 0 } }) }
})

// อนุมัติรายการ (Approve) แบบดึงจาก Stock
async function handleApprove(req, res) {
  const order = Orders.findById(req.params.id)
  if (!order) return res.status(404).send('❌ ไม่พบ Order')
  if (order.status === 'provisioned') return res.send('✅ ส่งของไปแล้ว')

  try {
    const stocks = getStock()
    // หา Config ที่ตรงแผนและยังไม่ถูกใช้
    const itemIndex = stocks.findIndex(i => i.plan === order.plan && !i.isUsed)

    if (itemIndex === -1) {
      return res.status(400).send('❌ สินค้าในคลังหมด! กรุณาเติม Stock ก่อนกด Approve')
    }

    const selectedStock = stocks[itemIndex]
    
    // 1. ส่งเมลหาลูกค้า
    await sendConfigToCustomer(order, selectedStock.config)

    // 2. มาร์คว่าใช้แล้วและบันทึก
    stocks[itemIndex].isUsed = true
    stocks[itemIndex].soldTo = order.email
    stocks[itemIndex].soldAt = new Date().toISOString()
    saveStock(stocks)

    // 3. อัปเดตสถานะใน DB
    Orders.updateStatus(order.id, 'provisioned', {
      xray_email: `stock-${selectedStock.id}`,
      note: `Delivery from stock: ${selectedStock.id}`
    })

    console.log(`[admin] delivered stock ${selectedStock.id} to ${order.email}`)
    return res.send(`✅ อนุมัติสำเร็จ! ส่งไฟล์ ${selectedStock.id} ให้ลูกค้าแล้ว`)

  } catch (err) {
    console.error('[admin] delivery error:', err)
    return res.status(500).send(`❌ ผิดพลาด: ${err.message}`)
  }
}

router.get('/approve/:id', checkSecret, handleApprove)
router.post('/approve/:id', checkSecret, handleApprove)

// --- ส่วนอื่นๆ (orders, stats, slip) คงไว้ตามเดิม ---
router.get('/orders', checkSecret, (req, res) => {
  const { status } = req.query
  res.json({ ok: true, orders: Orders.findAll({ status }), total: Orders.count(status) })
})

router.get('/slip/:id', checkSecret, (req, res) => {
  const order = Orders.findById(req.params.id)
  if (!order) return res.status(404).send('No slip')
  res.sendFile(path.join(__dirname, '..', 'uploads', order.slip_path))
})

export default router
