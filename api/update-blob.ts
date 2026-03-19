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
      blobObj = JSON.parse(existingText)
    } catch {
      return res.status(422).json({ error: 'Existing blob is not valid JSON' })
    }

    // 2. Add/update sharedKeys for this grantee
    if (!blobObj.sharedKeys || typeof blobObj.sharedKeys !== 'object') {
      blobObj.sharedKeys = {}
    }
    ;(blobObj.sharedKeys as Record<string, unknown>)[granteeAddress.toLowerCase()] = keyEnvelope

    // 3. Re-pin updated blob using new Pinata API
    const updatedPayload = JSON.stringify(blobObj)
    const blob = new Blob([updatedPayload], { type: 'application/json' })
    const formData = new FormData()
    formData.append('file', blob, `medvault-updated-${Date.now()}.json`)
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
      return res.status(502).json({ error: 'Re-pin failed', detail: err })
    }

    const pinData = await pinResponse.json() as { data: { cid: string } }

    return res.status(200).json({ newCid: pinData.data.cid })
  } catch (e: unknown) {
    console.error('update-blob error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
  }
}