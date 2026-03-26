import { useEffect, useState } from 'react'
import { useSignMessage, useAccount } from 'wagmi'
import { deriveKeyFromSignature, isSecureContext } from '@/lib/crypto'

const ENC_MSG = (addr: string) =>
  `VeriHealth encryption key v1\nWallet: ${addr.toLowerCase()}\n\nSign to unlock your encrypted health records.\nNo gas is spent.`

const GRANTEE_MSG = (addr: string) =>
  `VeriHealth grantee key v1\nWallet: ${addr.toLowerCase()}\n\nSign to access records shared with you.\nNo gas is spent.`

export function useEncryptionKey() {
  const { address } = useAccount()
  const [encKey,  setEncKey]  = useState<CryptoKey | null>(null)
  const [encSig,  setEncSig]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { signMessageAsync } = useSignMessage()

  const derive = async () => {
    if (!address) return
    if (!isSecureContext()) {
      setError('Encryption requires HTTPS or localhost.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const sig = await signMessageAsync({ message: ENC_MSG(address) })
      const key = await deriveKeyFromSignature(sig)
      setEncKey(key)
      setEncSig(sig)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Signature rejected')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (address && !encKey) derive() }, [address])
  useEffect(() => { if (!address) { setEncKey(null); setEncSig(null) } }, [address])

  return { encKey, encSig, error, loading, derive }
}

export function useGranteeKey() {
  const { address } = useAccount()
  const [granteeSig, setGranteeSig] = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)

  const { signMessageAsync } = useSignMessage()

  const deriveGranteeKey = async (): Promise<string | null> => {
    if (!address) return null
    if (!isSecureContext()) {
      setError('Requires HTTPS or localhost.')
      return null
    }
    setLoading(true)
    setError(null)
    try {
      const sig = await signMessageAsync({ message: GRANTEE_MSG(address) })
      setGranteeSig(sig)
      return sig
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Signature rejected')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (!address) setGranteeSig(null) }, [address])

  return { granteeSig, error, loading, deriveGranteeKey }
}