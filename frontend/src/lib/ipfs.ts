/**
 * IPFS blob storage via Vercel API proxy.
 *
 * All blobs are AES-256-GCM encrypted before they reach this layer —
 * the server only ever sees ciphertext, never plaintext.
 *
 * Falls back to localStorage if the API is unavailable (dev mode).
 */

const IS_DEV = import.meta.env.DEV && !import.meta.env.VITE_USE_IPFS

/** Pin an encrypted blob. Returns the IPFS CID. */
export async function pinBlob(payload: string, name?: string): Promise<string> {
  if (IS_DEV) {
    // Dev fallback — generate a deterministic fake CID from content
    const encoder = new TextEncoder()
    const data = encoder.encode(payload)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    const fakeCid = 'Qm' + hashHex.slice(0, 44)
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
  // Cache locally for instant reads on same browser
  localStorage.setItem(`medvault_blob_${data.cid}`, payload)
  return data.cid
}

/** Fetch an encrypted blob by CID. */
export async function fetchBlob(cid: string): Promise<string | null> {
  // Check local cache first (fast path for same browser)
  const cached = localStorage.getItem(`medvault_blob_${cid}`)
  if (cached) return cached

  if (IS_DEV) return null

  try {
    const res = await fetch(`/api/blob/${cid}`)
    if (!res.ok) return null
    const data = await res.json() as { payload: string }
    // Cache locally
    localStorage.setItem(`medvault_blob_${cid}`, data.payload)
    return data.payload
  } catch {
    return null
  }
}

/**
 * Update a blob's sharedKeys for a grantee and re-pin.
 * Returns the new CID (content changes so CID changes).
 * We store a mapping oldCid → newAccessCid so grantees can find it.
 */
export async function updateBlobForGrantee(
  cid: string,
  granteeAddress: string,
  keyEnvelope: { ciphertext: string; iv: string }
): Promise<string> {
  // Update local cache first
  const cached = localStorage.getItem(`medvault_blob_${cid}`)
  if (cached) {
    const blob = JSON.parse(cached)
    if (!blob.sharedKeys) blob.sharedKeys = {}
    blob.sharedKeys[granteeAddress.toLowerCase()] = keyEnvelope
    localStorage.setItem(`medvault_blob_${cid}`, JSON.stringify(blob))
  }

  if (IS_DEV) return cid

  const res = await fetch('/api/update-blob', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, granteeAddress, keyEnvelope }),
  })

  if (!res.ok) {
    const err = await res.json() as { error: string }
    throw new Error(`Update blob failed: ${err.error}`)
  }

  const data = await res.json() as { newCid: string }

  // Store mapping: originalCid → accessCid so grantees can find the updated blob
  const accessMap = JSON.parse(localStorage.getItem('medvault_access_cids') ?? '{}')
  accessMap[cid] = data.newCid
  localStorage.setItem('medvault_access_cids', JSON.stringify(accessMap))

  // Cache the new blob locally too
  if (cached) {
    const blob = JSON.parse(cached)
    localStorage.setItem(`medvault_blob_${data.newCid}`, JSON.stringify(blob))
  }

  return data.newCid
}

/**
 * Fetch a blob for a grantee — checks the access CID map first
 * since grantAccess may have produced a new CID with sharedKeys.
 */
export async function fetchBlobForGrantee(cid: string): Promise<string | null> {
  // Check if there's an updated access CID for this blob
  const accessMap = JSON.parse(localStorage.getItem('medvault_access_cids') ?? '{}')
  const accessCid = accessMap[cid] ?? cid
  return fetchBlob(accessCid)
}
