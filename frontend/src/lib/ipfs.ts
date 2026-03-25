const IS_DEV = import.meta.env.DEV === true && import.meta.env.VITE_USE_IPFS !== 'true'

/** Pin an encrypted blob. Returns the IPFS CID. */
export async function pinBlob(payload: string, name?: string): Promise<string> {
  if (IS_DEV) {
    const encoder = new TextEncoder()
    const data = encoder.encode(payload)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray  = Array.from(new Uint8Array(hashBuffer))
    const hashHex    = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    const fakeCid    = 'Qm' + hashHex.slice(0, 44)
    localStorage.setItem(`medvault_blob_${fakeCid}`, payload)
    return fakeCid
  }

  const res = await fetch('/api/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, name }),
  })

  if (!res.ok) {
    const err = await res.json() as { error: string }
    throw new Error(`Pin failed: ${err.error}`)
  }

  const data = await res.json() as { cid: string }
  localStorage.setItem(`medvault_blob_${data.cid}`, payload)
  return data.cid
}

/** Fetch an encrypted blob by CID. */
export async function fetchBlob(cid: string): Promise<string | null> {
  // Check local cache first
  const cached = localStorage.getItem(`medvault_blob_${cid}`)
  if (cached) return cached

  if (IS_DEV) return null

  try {
    const res = await fetch(`/api/blob/${cid}`)
    console.log('Blob fetch status:', res.status, 'for CID:', cid)

    if (!res.ok) {
      const err = await res.text()
      console.error('Blob fetch error:', err)
      return null
    }

    const raw = await res.text()
    console.log('Raw API response:', raw.slice(0, 200))

    let payload: string | null = null

    try {
      const data = JSON.parse(raw) as { payload?: string }
      console.log('Parsed payload length:', data.payload?.length)
      payload = data.payload ?? null
    } catch (e) {
      console.error('Failed to parse blob response:', e)
      return null
    }

    if (!payload) {
      console.error('Payload is empty or undefined')
      return null
    }

    localStorage.setItem(`medvault_blob_${cid}`, payload)
    return payload

  } catch (e) {
    console.error('fetchBlob error:', e)
    return null
  }
}