# dumuVPN Backend

Node.js backend สำหรับรับ order → ตรวจสอบสลิป → สร้าง user ใน 3x-ui → ส่ง config ให้ลูกค้าอัตโนมัติ

## Flow การทำงาน

```
ลูกค้า submit order + อัพสลิป
        ↓
Backend บันทึก order → ส่ง email แจ้งเจ้าหน้าที่
        ↓
เจ้าหน้าที่กด Approve link ใน email
        ↓
Backend สร้าง client ใน 3x-ui อัตโนมัติ
        ↓
ส่ง VLESS link + คู่มือตั้งค่า ให้ลูกค้าผ่าน email
```

---

## ติดตั้งบน VPS

### ความต้องการ
- Ubuntu 20.04+ หรือ Debian 11+
- 3x-ui panel ที่รันอยู่แล้ว
- Gmail account (สำหรับส่ง email)

### ขั้นตอนติดตั้ง

```bash
# 1. โอนไฟล์ขึ้น VPS
scp -r dumuvpn-backend/ root@YOUR_VPS_IP:/tmp/

# 2. SSH เข้า VPS
ssh root@YOUR_VPS_IP

# 3. รัน installer
cd /tmp/dumuvpn-backend
bash install.sh
```

### ตั้งค่า .env

```bash
nano /opt/dumuvpn-backend/.env
```

ค่าที่ต้องแก้ไข:

| ตัวแปร | ค่า | หมายเหตุ |
|--------|-----|----------|
| `XRAY_PANEL_URL` | `http://localhost:54321` | URL ของ 3x-ui |
| `XRAY_USERNAME` | `admin` | username 3x-ui |
| `XRAY_PASSWORD` | `your_password` | password 3x-ui |
| `XRAY_INBOUND_ID` | `1` | ดูจาก 3x-ui → Inbounds |
| `SMTP_PASS` | Gmail App Password | ดูวิธีด้านล่าง |
| `ADMIN_EMAIL` | `thanapol.dome1@gmail.com` | รับ email แจ้งเตือน |
| `FRONTEND_URL` | `https://dumuvpn.com` | domain เว็บขาย |

### ตั้งค่า Gmail App Password

1. ไปที่ [myaccount.google.com/security](https://myaccount.google.com/security)
2. เปิด **2-Step Verification** (ต้องเปิดก่อน)
3. ไปที่ **App passwords** → สร้าง password ใหม่
4. เลือก Mail → Other → ตั้งชื่อว่า "dumuVPN"
5. Copy รหัส 16 หลัก ใส่ใน `SMTP_PASS=`

### Start server

```bash
cd /opt/dumuvpn-backend
pm2 start ecosystem.config.cjs
pm2 save          # บันทึกให้ start อัตโนมัติ
pm2 startup       # ทำให้ PM2 boot กับ system
```

### ดู log

```bash
pm2 logs dumuvpn-backend        # realtime log
pm2 logs dumuvpn-backend --lines 100   # 100 บรรทัดล่าสุด
```

---

## API Endpoints

### สำหรับลูกค้า (frontend เรียก)

#### `POST /api/orders` — สร้าง order ใหม่

```
Content-Type: multipart/form-data

Fields:
  name     string  ชื่อลูกค้า
  email    string  email สำหรับรับ config
  contact  string  LINE ID / Facebook
  plan     string  "standard" หรือ "duo"
  slip     file    รูปสลิป (JPG/PNG/PDF, max 5MB)
```

Response:
```json
{
  "ok": true,
  "orderId": "uuid-...",
  "message": "รับคำสั่งซื้อแล้ว..."
}
```

#### `GET /api/orders/:id` — เช็คสถานะ order

```json
{
  "ok": true,
  "order": {
    "id": "...",
    "plan": "standard",
    "price": 59,
    "status": "pending",
    "created_at": "..."
  }
}
```

Status ที่เป็นไปได้: `pending` → `provisioned` หรือ `rejected`

---

### สำหรับเจ้าหน้าที่ (ต้องใส่ secret)

```
?secret=YOUR_ADMIN_SECRET  ทุก endpoint
```

#### `GET /admin/orders` — ดู order ทั้งหมด
```
GET /admin/orders?secret=xxx
GET /admin/orders?secret=xxx&status=pending
```

#### `GET /admin/approve/:id` — Approve + สร้าง config
```
GET /admin/approve/ORDER_ID?secret=xxx
```
→ สร้าง client ใน 3x-ui → ส่ง email config ให้ลูกค้า

#### `GET /admin/reject/:id` — Reject order
```
GET /admin/reject/ORDER_ID?secret=xxx&reason=สลิปไม่ถูกต้อง
```

#### `GET /admin/slip/:id` — ดูสลิปที่ลูกค้าอัพโหลด
```
GET /admin/slip/ORDER_ID?secret=xxx
```

#### `GET /admin/stats` — สรุปจำนวน order
```json
{
  "stats": {
    "total": 10,
    "pending": 3,
    "provisioned": 6,
    "rejected": 1
  }
}
```

---

## เชื่อมกับหน้าเว็บ (dumuVPN.html)

แก้ไขส่วน `confirmOrder()` ใน HTML ให้ POST ไป backend:

```javascript
async function confirmOrder() {
  const formData = new FormData()
  formData.append('name',    document.getElementById('f-name').value)
  formData.append('email',   document.getElementById('f-email').value)
  formData.append('contact', document.getElementById('f-contact').value)
  formData.append('plan',    selectedPlan)  // 'standard' หรือ 'duo'

  const slipFile = document.getElementById('slip-input').files[0]
  if (slipFile) formData.append('slip', slipFile)

  const res  = await fetch('https://YOUR_VPS_IP:3000/api/orders', {
    method: 'POST',
    body:   formData,
  })
  const data = await res.json()

  if (data.ok) {
    // แสดง success + order ID
    showSuccess(data.orderId)
  }
}
```

---

## ดู Inbound ID ใน 3x-ui

1. เปิด 3x-ui panel
2. ไปที่ **Inbounds**
3. คลิกที่ inbound ที่ต้องการ
4. ดู ID ในหน้า URL หรือ JSON — นำมาใส่ `XRAY_INBOUND_ID=`

---

## วาง frontend HTML

```bash
# วาง dumuVPN.html ไว้ที่
cp dumuVPN.html /opt/dumuvpn-backend/public/index.html

# Backend จะเสิร์ฟที่ http://localhost:3000/
```

หรือใช้ Nginx reverse proxy:

```nginx
server {
    listen 80;
    server_name dumuvpn.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        root /opt/dumuvpn-backend/public;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Commands สรุป

```bash
pm2 restart dumuvpn-backend   # restart
pm2 stop dumuvpn-backend      # stop
pm2 delete dumuvpn-backend    # ลบออกจาก PM2
pm2 monit                     # monitor GUI

# ดู order DB
sqlite3 /opt/dumuvpn-backend/data/orders.db \
  "SELECT id,name,plan,status,created_at FROM orders ORDER BY created_at DESC LIMIT 20;"
```
