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

    // Wrap the raw payload string inside a JSON object
    // pinataContent must be a plain JSON object — we store the
    // encrypted string under a "data" key
    const pinataContent = { data: payload }

    const pinResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent,
        pinataMetadata: {
          name: name ?? `medvault-${Date.now()}`,
        },
        pinataOptions: {
          cidVersion: 0,
        },
      }),
    })

    const responseText = await pinResponse.text()
    console.log('Pinata response status:', pinResponse.status)
    console.log('Pinata response body:', responseText)

    if (!pinResponse.ok) {
      return res.status(502).json({ error: 'Pinata pinning failed', detail: responseText })
    }

    const data = JSON.parse(responseText) as { IpfsHash: string; PinSize: number }

    return res.status(200).json({ cid: data.IpfsHash, pinSize: data.PinSize })
  } catch (e: unknown) {
    console.error('Pin error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
  }
}