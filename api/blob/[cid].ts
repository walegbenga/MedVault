import type { VercelRequest, VercelResponse } from '@vercel/node'
import { rateLimit, getIp } from '../lib/rateLimit'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Rate limit: 100 fetches per 10 minutes per IP
  const ip = getIp(req)
  const limit = rateLimit(ip, { windowMs: 10 * 60 * 1000, max: 100 })
  if (!limit.success) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      resetAt: limit.resetAt,
    })
  }

  const { cid } = req.query

  if (!cid || typeof cid !== 'string') {
    return res.status(400).json({ error: 'Missing CID' })
  }

  if (!/^[a-zA-Z0-9]+$/.test(cid)) {
    return res.status(400).json({ error: 'Invalid CID format' })
  }

  const gateway = process.env.PINATA_GATEWAY
  const token   = process.env.PINATA_GATEWAY_TOKEN

  if (!gateway) {
    return res.status(500).json({ error: 'PINATA_GATEWAY not configured' })
  }

  try {
    const url = `${gateway.replace(/\/$/, '')}/ipfs/${cid}`
    const headers: Record<string, string> = {}
    if (token) headers['x-pinata-gateway-token'] = token

    const fetchRes = await fetch(url, { headers })

    if (!fetchRes.ok) {
      if (fetchRes.status === 404) {
        return res.status(404).json({ error: 'Blob not found on IPFS' })
      }
      return res.status(502).json({ error: `Gateway returned ${fetchRes.status}` })
    }

    const text = await fetchRes.text()
    let payload: string

    try {
      const parsed = JSON.parse(text) as { data?: string }
      payload = parsed.data ?? text
    } catch {
      payload = text
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(200).json({ payload })

  } catch (e: unknown) {
    console.error('Blob fetch error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
  }
}