export interface EncryptedPayload {
  ciphertext: string
  iv: string
}

/** Chunked base64 — avoids call-stack overflow for arrays >64KB */
export function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function isSecureContext(): boolean {
  return window.isSecureContext
}

/** Derive a stable AES-256-GCM key from a wallet signature using HKDF */
export async function deriveKeyFromSignature(sig: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(sig), { name: 'HKDF' }, false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: enc.encode('MedVault v1'),
      info: enc.encode('record-encryption'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/** Export a CryptoKey to raw bytes */
export async function exportKeyBytes(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return new Uint8Array(raw)
}

/** Import raw bytes as an AES-GCM CryptoKey */
export async function importKeyBytes(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', bytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Encrypt plaintext string with an AES-GCM key */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(plaintext)
  )
  return {
    ciphertext: uint8ToBase64(new Uint8Array(enc)),
    iv: uint8ToBase64(iv),
  }
}

/** Decrypt an EncryptedPayload with an AES-GCM key */
export async function decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToUint8(payload.iv) },
    key,
    base64ToUint8(payload.ciphertext)
  )
  return new TextDecoder().decode(dec)
}

/**
 * Encrypt the patient's AES key for a specific grantee.
 * Uses the grantee's wallet signature as key material to derive
 * a wrapping key, then encrypts the patient's AES key bytes with it.
 * Only someone who can reproduce the same signature can decrypt it.
 */
export async function encryptAesKeyForGrantee(
  patientKey: CryptoKey,
  granteeSig: string
): Promise<EncryptedPayload> {
  const granteeWrapKey = await deriveKeyFromSignature(granteeSig + '-wrap-v1')
  const patientKeyBytes = await exportKeyBytes(patientKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, granteeWrapKey, patientKeyBytes
  )
  return {
    ciphertext: uint8ToBase64(new Uint8Array(encBuf)),
    iv: uint8ToBase64(iv),
  }
}

/**
 * Grantee decrypts the patient's AES key using their own wallet signature.
 */
export async function decryptAesKeyFromEnvelope(
  envelope: EncryptedPayload,
  granteeSig: string
): Promise<CryptoKey> {
  const granteeWrapKey = await deriveKeyFromSignature(granteeSig + '-wrap-v1')
  const patientKeyBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToUint8(envelope.iv) },
    granteeWrapKey,
    base64ToUint8(envelope.ciphertext)
  )
  return importKeyBytes(new Uint8Array(patientKeyBytes))
}