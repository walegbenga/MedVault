/**
 * IPFS blob storage via Vercel API proxy.
 *
 * All blobs are AES-256-GCM encrypted before they reach this layer —
 * the server only ever sees ciphertext, never plaintext.
 *
 * Key envelopes are stored on-chain in the contract.
 * This file only handles pinning new blobs and fetching existing ones.
 *
 * Falls back to localStorage if the API is unavailable (dev mode).
 */

const IS_DEV = import.meta.env.DEV === true && import.meta.env.VITE_USE_IPFS !== 'true'

/** Pin an encrypted blob. Returns the IPFS CID. */
export async function pinBlob(payload: string, name?: string): Promise<string> {
  if (IS_DEV) {
    const encoder    = new TextEncoder()
    const data       = encoder.encode(payload)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray  = Array.from(new Uint8Array(hashBuffer))
    const hashHex    = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    const fakeCid    = 'Qm' + hashHex.slice(0, 44)
    localStorage.setItem(`verihealth_blob_${fakeCid}`, payload)
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
  localStorage.setItem(`verihealth_blob_${data.cid}`, payload)
  return data.cid
}

/** Fetch an encrypted blob by CID. */
export async function fetchBlob(cid: string): Promise<string | null> {
  // Check local cache first
  const cached = localStorage.getItem(`verihealth_blob_${cid}`)
  if (cached) return cached

  if (IS_DEV) return null

  try {
    const res = await fetch(`/api/blob/${cid}`)
    if (!res.ok) return null

    const raw = await res.text()

    let payload: string | null = null
    try {
      const data = JSON.parse(raw) as { payload?: string }
      payload = data.payload ?? null
    } catch {
      return null
    }

    if (!payload) return null

    localStorage.setItem(`verihealth_blob_${cid}`, payload)
    return payload

  } catch {
    return null
  }
}