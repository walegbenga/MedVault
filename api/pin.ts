import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return res.status(500).json({ error: 'PINATA_JWT not configured' })
  }

  try {
    const { payload, name } = req.body as { payload: string; name?: string }

    if (!payload || typeof payload !== 'string') {
      return res.status(400).json({ error: 'Missing payload' })
    }

    // Pinata new API — upload as a file
    const blob = new Blob([payload], { type: 'application/json' })
    const formData = new FormData()
    formData.append('file', blob, name ?? `medvault-${Date.now()}.json`)
    formData.append('network', 'public')

    const pinResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
      },
      body: formData,
    })

    if (!pinResponse.ok) {
      const err = await pinResponse.text()
      console.error('Pinata pin error:', err)
      return res.status(502).json({ error: 'Pinata pinning failed', detail: err })
    }

    const pinData = await pinResponse.json() as { data: { cid: string; size: number } }

    return res.status(200).json({
      cid:     pinData.data.cid,
      pinSize: pinData.data.size,
    })
  } catch (e: unknown) {
    console.error('Pin handler error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
  }
}