import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwt     = process.env.PINATA_JWT
  const gateway = process.env.PINATA_GATEWAY
  const token   = process.env.PINATA_GATEWAY_TOKEN

  if (!jwt || !gateway) {
    return res.status(500).json({ error: 'Pinata env vars not configured' })
  }

  try {
    const { cid, granteeAddress, keyEnvelope } = req.body as {
      cid: string
      granteeAddress: string
      keyEnvelope: { ciphertext: string; iv: string }
    }

    if (!cid || !granteeAddress || !keyEnvelope) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!/^[a-zA-Z0-9]+$/.test(cid)) {
      return res.status(400).json({ error: 'Invalid CID format' })
    }

    // 1. Fetch existing blob from gateway
    const gatewayUrl = `${gateway.replace(/\/$/, '')}/ipfs/${cid}`
    const headers: Record<string, string> = {}
    if (token) headers['x-pinata-gateway-token'] = token

    const fetchRes = await fetch(gatewayUrl, { headers })

    if (!fetchRes.ok) {
      return res.status(502).json({ error: `Could not fetch existing blob: ${fetchRes.status}` })
    }

    const existingText = await fetchRes.text()
    let blobObj: Record<string, unknown>

    try {
      // The legacy pinJSONToIPFS stores the content directly
      // so the response is the JSON object itself
      blobObj = JSON.parse(existingText)
    } catch {
      return res.status(422).json({ error: 'Existing blob is not valid JSON' })
    }

    // 2. Add/update sharedKeys for this grantee
    if (!blobObj.sharedKeys || typeof blobObj.sharedKeys !== 'object') {
      blobObj.sharedKeys = {}
    }
    ;(blobObj.sharedKeys as Record<string, unknown>)[granteeAddress.toLowerCase()] = keyEnvelope

    // 3. Re-pin updated blob using legacy endpoint
    const pinResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: blobObj,
        pinataMetadata: {
          name: `medvault-updated-${Date.now()}`,
        },
        pinataOptions: {
          cidVersion: 0,
        },
      }),
    })

    if (!pinResponse.ok) {
      const err = await pinResponse.text()
      return res.status(502).json({ error: 'Re-pin failed', detail: err })
    }

    const pinData = await pinResponse.json() as { IpfsHash: string }

    return res.status(200).json({ newCid: pinData.IpfsHash })
  } catch (e: unknown) {
    console.error('update-blob error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
  }
}