// services/mailer.js
import nodemailer from 'nodemailer'

const transport = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = `"dumuVPN" <${process.env.SMTP_USER}>`

// ── แจ้งเจ้าหน้าที่มี order ใหม่ ───────────────────────────────
export async function notifyAdminNewOrder(order) {
  const approveUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/approve/${order.id}?secret=${process.env.ADMIN_SECRET}`
  const rejectUrl  = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/reject/${order.id}?secret=${process.env.ADMIN_SECRET}`

  await transport.sendMail({
    from:    FROM,
    to:      process.env.ADMIN_EMAIL,
    subject: `[dumuVPN] Order ใหม่ — ${order.name} · ${order.plan} · ฿${order.price}`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:24px}
  .card{background:#fff;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  h2{margin:0 0 24px;font-size:20px;color:#111}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
  .label{color:#888}
  .val{color:#111;font-weight:500}
  .btns{display:flex;gap:12px;margin-top:28px}
  .btn{flex:1;display:block;text-align:center;padding:13px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none}
  .approve{background:#111;color:#fff}
  .reject{background:#fff;color:#dc2626;border:1.5px solid #dc2626}
  .slip{margin-top:20px;font-size:13px;color:#666}
  .note{margin-top:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:13px;color:#92400e}
</style></head><body>
<div class="card">
  <h2>📦 Order ใหม่รอการยืนยัน</h2>
  <div class="row"><span class="label">Order ID</span><span class="val" style="font-family:monospace">${order.id}</span></div>
  <div class="row"><span class="label">ชื่อ</span><span class="val">${order.name}</span></div>
  <div class="row"><span class="label">Email</span><span class="val">${order.email}</span></div>
  <div class="row"><span class="label">ติดต่อ</span><span class="val">${order.contact}</span></div>
  <div class="row"><span class="label">แพ็ก</span><span class="val">${order.plan === 'standard' ? 'Standard — 1 เดือน' : 'Duo — 2 เดือน'}</span></div>
  <div class="row"><span class="label">ราคา</span><span class="val">฿${order.price}</span></div>
  <div class="row"><span class="label">เวลา</span><span class="val">${new Date(order.created_at).toLocaleString('th-TH')}</span></div>
  ${order.slip_path ? `<div class="slip">🧾 มีสลิปแนบมา — ดูได้ที่ Admin Dashboard</div>` : `<div class="note">⚠️ ลูกค้ายังไม่ได้แนบสลิป</div>`}
  <div class="btns">
    <a class="btn approve" href="${approveUrl}">✓ Approve &amp; สร้าง Config</a>
    <a class="btn reject"  href="${rejectUrl}">✕ Reject</a>
  </div>
  <p style="margin-top:16px;font-size:12px;color:#aaa;text-align:center">
    หรือจัดการที่ Admin Dashboard
  </p>
</div>
</body></html>`,
  })
}

// ── ส่ง config ให้ลูกค้า ────────────────────────────────────────
export async function sendConfigToCustomer(order, vlessLink) {
  const planLabel  = order.plan === 'standard' ? '1 เดือน' : '2 เดือน'
  const expireDate = new Date(
    Date.now() + (order.plan === 'standard' ? 30 : 60) * 86400000
  ).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  await transport.sendMail({
    from:    FROM,
    to:      order.email,
    subject: `[dumuVPN] ข้อมูลการเชื่อมต่อของคุณพร้อมแล้ว! 🚀`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:24px}
  .card{background:#fff;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  h2{margin:0 0 8px;font-size:22px;color:#111}
  .sub{color:#888;font-size:14px;margin-bottom:28px}
  .info-box{background:#f9f9f7;border:1px solid #e6e6e2;border-radius:10px;padding:20px;margin-bottom:20px}
  .row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
  .row:last-child{border:none}
  .label{color:#888}
  .val{color:#111;font-weight:500}
  .link-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:20px 0}
  .link-label{font-size:12px;color:#16a34a;font-weight:600;margin-bottom:8px}
  .link-val{font-family:monospace;font-size:11px;color:#111;word-break:break-all;line-height:1.6}
  .apps{margin:24px 0}
  .apps h3{font-size:14px;font-weight:600;margin-bottom:12px}
  .app-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:6px}
  .app-list li{font-size:13px;color:#555;padding-left:18px;position:relative}
  .app-list li::before{content:"→";position:absolute;left:0;color:#111}
  .steps{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:20px 0}
  .steps h3{font-size:14px;font-weight:600;color:#1d4ed8;margin-bottom:10px}
  .steps ol{padding-left:18px;font-size:13px;color:#1e40af;line-height:1.8}
  .footer{margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f0;font-size:12px;color:#aaa;text-align:center;line-height:1.8}
</style></head><body>
<div class="card">
  <h2>การเชื่อมต่อของคุณพร้อมแล้ว! 🎉</h2>
  <div class="sub">สวัสดีคุณ ${order.name} — ขอบคุณที่ใช้บริการ dumuVPN</div>

  <div class="info-box">
    <div class="row"><span class="label">แพ็ก</span><span class="val">${order.plan === 'standard' ? 'Standard' : 'Duo'} (${planLabel})</span></div>
    <div class="row"><span class="label">หมดอายุ</span><span class="val">${expireDate}</span></div>
    <div class="row"><span class="label">Order ID</span><span class="val" style="font-family:monospace;font-size:12px">${order.id}</span></div>
  </div>

  <div class="link-box">
    <div class="link-label">🔗 VLESS Connection Link</div>
    <div class="link-val">${vlessLink}</div>
  </div>

  <div class="steps">
    <h3>วิธีตั้งค่าใน 3 ขั้นตอน</h3>
    <ol>
      <li>ดาวน์โหลดแอป Hiddify (iOS/Android) หรือ v2rayNG (Android)</li>
      <li>กด "+" แล้วเลือก "Import from clipboard" แล้ว paste link ด้านบน</li>
      <li>กด Connect — พร้อมใช้งาน!</li>
    </ol>
  </div>

  <div class="apps">
    <h3>แอปที่รองรับ</h3>
    <ul class="app-list">
      <li>Hiddify — iOS &amp; Android (แนะนำ)</li>
      <li>v2rayNG — Android</li>
      <li>Shadowrocket — iOS</li>
      <li>NekoRay / NekoBox — Windows &amp; Linux</li>
      <li>Hiddify Next — macOS &amp; Windows</li>
    </ul>
  </div>

  <div class="footer">
    มีปัญหา? ติดต่อได้ที่<br>
    Facebook: facebook.com/thanapol.chaipanna<br>
    LINE: i2DIEUnUNW<br><br>
    © 2025 dumuVPN
  </div>
</div>
</body></html>`,
  })
}

// ── แจ้ง reject ────────────────────────────────────────────────
export async function notifyRejected(order, reason = '') {
  await transport.sendMail({
    from:    FROM,
    to:      order.email,
    subject: `[dumuVPN] คำสั่งซื้อของคุณไม่ผ่านการตรวจสอบ`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:12px;padding:32px;max-width:480px;margin:0 auto}
h2{margin:0 0 8px;color:#111}
p{color:#555;font-size:14px;line-height:1.7}
.reason{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:14px;color:#991b1b;margin:16px 0}
</style></head><body>
<div class="card">
  <h2>คำสั่งซื้อไม่ผ่านการตรวจสอบ</h2>
  <p>เรียนคุณ ${order.name},</p>
  <p>คำสั่งซื้อหมายเลข <strong>${order.id}</strong> ไม่ผ่านการตรวจสอบสลิปการชำระเงิน</p>
  ${reason ? `<div class="reason">${reason}</div>` : ''}
  <p>หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อทีมงานที่<br>
  Facebook: facebook.com/thanapol.chaipanna<br>
  LINE: i2DIEUnUNW</p>
</div></body></html>`,
  })
}

export async function verifyConnection() {
  await transport.verify()
  console.log('[mailer] SMTP connection OK')
}
  <div class="link-box">
    <div class="link-label">🔗 VLESS Connection Link</div>
    <div class="link-val">${vlessLink}</div>
  </div>

  <div class="steps">
    <h3>วิธีตั้งค่าใน 3 ขั้นตอน</h3>
    <ol>
      <li>ดาวน์โหลดแอป Hiddify (iOS/Android) หรือ v2rayNG (Android)</li>
      <li>กด "+" แล้วเลือก "Import from clipboard" แล้ว paste link ด้านบน</li>
      <li>กด Connect — พร้อมใช้งาน!</li>
    </ol>
  </div>

  <div class="apps">
    <h3>แอปที่รองรับ</h3>
    <ul class="app-list">
      <li>Hiddify — iOS &amp; Android (แนะนำ)</li>
      <li>v2rayNG — Android</li>
      <li>Shadowrocket — iOS</li>
      <li>NekoRay / NekoBox — Windows &amp; Linux</li>
      <li>Hiddify Next — macOS &amp; Windows</li>
    </ul>
  </div>

  <div class="footer">
    มีปัญหา? ติดต่อได้ที่<br>
    Facebook: facebook.com/thanapol.chaipanna<br>
    LINE: i2DIEUnUNW<br><br>
    © 2025 dumuVPN
  </div>
</div>
</body></html>`,
  })
}

// ── แจ้ง reject ────────────────────────────────────────────────
export async function notifyRejected(order, reason = '') {
  await transport.sendMail({
    from:    FROM,
    to:      order.email,
    subject: `[dumuVPN] คำสั่งซื้อของคุณไม่ผ่านการตรวจสอบ`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:12px;padding:32px;max-width:480px;margin:0 auto}
h2{margin:0 0 8px;color:#111}
p{color:#555;font-size:14px;line-height:1.7}
.reason{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:14px;color:#991b1b;margin:16px 0}
</style></head><body>
<div class="card">
  <h2>คำสั่งซื้อไม่ผ่านการตรวจสอบ</h2>
  <p>เรียนคุณ ${order.name},</p>
  <p>คำสั่งซื้อหมายเลข <strong>${order.id}</strong> ไม่ผ่านการตรวจสอบสลิปการชำระเงิน</p>
  ${reason ? `<div class="reason">${reason}</div>` : ''}
  <p>หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อทีมงานที่<br>
  Facebook: facebook.com/thanapol.chaipanna<br>
  LINE: i2DIEUnUNW</p>
</div></body></html>`,
  })
}

export async function verifyConnection() {
  await transport.verify()
  console.log('[mailer] SMTP connection OK')
}
