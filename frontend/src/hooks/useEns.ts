import { useState, useCallback, useEffect } from 'react'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'wagmi/chains'

// ENS only lives on Ethereum mainnet — always use mainnet for lookups
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com', {
    batch: true,
    retryCount: 3,
  }),
})

/**
 * Resolve an ENS name to an address.
 * Returns null if not found or invalid.
 */
export async function resolveEns(name: string): Promise<string | null> {
  if (!name.endsWith('.eth') && !name.includes('.')) return null
  try {
    const address = await ensClient.getEnsAddress({ name: name.trim().toLowerCase() })
    return address ?? null
  } catch {
    return null
  }
}

/**
 * Reverse-lookup an address to get its ENS name.
 * Returns null if no ENS name is set.
 */
export async function lookupEns(address: string): Promise<string | null> {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  try {
    const name = await ensClient.getEnsName({ address: address as `0x${string}` })
    return name ?? null
  } catch {
    return null
  }
}

/**
 * Hook for resolving ENS names with loading state.
 * Use in address input fields.
 */
export function useEnsResolver() {
  const [resolving, setResolving] = useState(false)
  const [resolved,  setResolved]  = useState<string | null>(null)
  const [ensName,   setEnsName]   = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  const resolve = useCallback(async (input: string) => {
    setError(null)
    setResolved(null)
    setEnsName(null)

    // Already a valid address
    if (/^0x[0-9a-fA-F]{40}$/.test(input)) {
      setResolved(input)
      // Reverse lookup for display
      const name = await lookupEns(input)
      if (name) setEnsName(name)
      return input
    }

    // Try ENS resolution
    if (input.includes('.')) {
      setResolving(true)
      try {
        const address = await resolveEns(input)
        if (address) {
          setResolved(address)
          setEnsName(input)
          return address
        } else {
          setError(`Could not resolve "${input}"`)
          return null
        }
      } catch {
        setError('ENS resolution failed')
        return null
      } finally {
        setResolving(false)
      }
    }

    return null
  }, [])

  const reset = useCallback(() => {
    setResolved(null)
    setEnsName(null)
    setError(null)
    setResolving(false)
  }, [])

  return { resolving, resolved, ensName, error, resolve, reset }
}

/**
 * Hook for reverse-looking up an address to ENS name.
 * Use for displaying addresses with ENS names.
 */
export function useEnsName(address: string | undefined) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return
    lookupEns(address).then(n => setName(n))
  }, [address])

  return name
}