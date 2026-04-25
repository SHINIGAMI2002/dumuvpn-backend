// services/xray.js  — 3x-ui panel API client
import fetch from 'node-fetch'

const BASE        = process.env.XRAY_PANEL_URL
const USERNAME    = process.env.XRAY_USERNAME
const PASSWORD    = process.env.XRAY_PASSWORD
const INBOUND_ID  = parseInt(process.env.XRAY_INBOUND_ID || '1')

let _cookie = null   // session cookie จาก login

// ── Login ─────────────────────────────────────────────────────
async function login() 
  const res = await fetch(`${BASE}/login`,
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ username: USERNAME, password: PASSWORD }),
    redirect: 'manual',
  })

  // 3x-ui ตอบ Set-Cookie เมื่อ login สำเร็จ
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('3x-ui login failed — check XRAY_USERNAME / XRAY_PASSWORD')

  _cookie = setCookie.split(';')[0]   // เก็บแค่ session=xxx
  console.log('[xray] logged in to 3x-ui panel')
  return _cookie
}

// ── Authenticated fetch ────────────────────────────────────────
async function apiFetch(path, opts = {}, retry = true) {
  if (!_cookie) await login()

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Cookie: _cookie,
      ...opts.headers,
    },
  })

  // session หมดอายุ — login ใหม่แล้ว retry 1 ครั้ง
  if (res.status === 401 && retry) {
    _cookie = null
    return apiFetch(path, opts, false)
  }

  const data = await res.json().catch(() => ({}))
  if (data.success === false) throw new Error(`3x-ui error: ${data.msg || JSON.stringify(data)}`)
  return data
}

// ── Get inbound info ───────────────────────────────────────────
export async function getInbound(inboundId = INBOUND_ID) {
  const data = await apiFetch(`/panel/api/inbounds/get/${inboundId}`)
  return data.obj
}

// ── List clients in inbound ────────────────────────────────────
export async function listClients(inboundId = INBOUND_ID) {
  const inbound = await getInbound(inboundId)
  const settings = JSON.parse(inbound.settings || '{}')
  return settings.clients || []
}

// ── Add client to inbound ──────────────────────────────────────
export async function addClient({ uuid, email, limitGB = 0, expiryDays, inboundId = INBOUND_ID }) {
  // คำนวณ expiry timestamp (ms) — 0 = ไม่หมดอายุ
  const expiryTime = expiryDays
    ? Date.now() + expiryDays * 24 * 60 * 60 * 1000
    : 0

  // สร้างฟังก์ชันสุ่ม subId (ตัวเลข+ตัวอักษร 12 หลัก)
  const randomSubId = Math.random().toString(36).substring(2, 14);

  const client = {
    id:         uuid,
    flow:       'xtls-rprx-vision',   
    email,
    limitIp:    0,
    totalGB:    limitGB * 1024 ** 3,  
    expiryTime,
    enable:     true,
    tgId:       '',
    subId:      randomSubId, // แก้ตรงนี้จากเดิมที่เป็น '' ให้เป็นตัวแปร randomSubId
    reset:      0,
  }

  await apiFetch(`/panel/api/inbounds/addClient`, {
    method: 'POST',
    body:   JSON.stringify({ id: inboundId, settings: JSON.stringify({ clients: [client] }) }),
  })

  console.log(`[xray] client added: ${email} (${uuid}) with subId: ${randomSubId}`)
  return client
}

  await apiFetch(`/panel/api/inbounds/addClient`, {
    method: 'POST',
    body:   JSON.stringify({ id: inboundId, settings: JSON.stringify({ clients: [client] }) }),
  })

  console.log(`[xray] client added: ${email} (${uuid})`)
  return client
}

// ── Disable client ─────────────────────────────────────────────
export async function disableClient(uuid, inboundId = INBOUND_ID) {
  const inbound  = await getInbound(inboundId)
  const settings = JSON.parse(inbound.settings || '{}')
  const clients  = settings.clients || []

  const updated = clients.map(c =>
    c.id === uuid ? { ...c, enable: false } : c
  )

  await apiFetch(`/panel/api/inbounds/updateClient/${uuid}`, {
    method: 'POST',
    body:   JSON.stringify({
      id: inboundId,
      settings: JSON.stringify({ clients: updated }),
    }),
  })
  console.log(`[xray] client disabled: ${uuid}`)
}

// ── Delete client ──────────────────────────────────────────────
export async function deleteClient(uuid, inboundId = INBOUND_ID) {
  await apiFetch(`/panel/api/inbounds/${inboundId}/delClient/${uuid}`, {
    method: 'POST',
  })
  console.log(`[xray] client deleted: ${uuid}`)
}

// ── Get client traffic ─────────────────────────────────────────
export async function getClientTraffic(email) {
  const data = await apiFetch(`/panel/api/inbounds/getClientTraffics/${email}`)
  return data.obj   // { up, down, total, enable, expiryTime, ... }
}

// ── Generate VLESS link from inbound config ────────────────────
export async function genVlessLink({ uuid, email, inboundId = INBOUND_ID, serverHost }) {
  const inbound      = await getInbound(inboundId)
  const stream       = JSON.parse(inbound.streamSettings || '{}')
  const realityConf  = stream.realitySettings || {}
  const port         = inbound.port

  // รองรับทั้ง Reality และ TLS
  const security = stream.security || 'none'
  const network  = stream.network  || 'tcp'

  let params = new URLSearchParams({
    type:     network,
    security,
  })

  if (security === 'reality') {
    params.set('pbk',  realityConf.publicKey   || '')
    params.set('fp',   realityConf.fingerprint || 'chrome')
    params.set('sni',  (realityConf.serverNames || [])[0] || 'www.cloudflare.com')
    params.set('sid',  (realityConf.shortIds    || [])[0] || '')
    params.set('flow', 'xtls-rprx-vision')
  } else if (security === 'tls') {
    const tls = stream.tlsSettings || {}
    params.set('sni', tls.serverName || serverHost || '')
    params.set('fp',  'chrome')
  }

  if (network === 'ws') {
    const ws = stream.wsSettings || {}
    if (ws.path) params.set('path', ws.path)
  }

  const host   = serverHost || new URL(BASE).hostname
  const remark = encodeURIComponent(`dumuVPN-${email}`)

  return `vless://${uuid}@${host}:${port}?${params.toString()}#${remark}`
}

export default { login, getInbound, listClients, addClient, disableClient, deleteClient, getClientTraffic, genVlessLink }
