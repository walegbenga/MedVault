import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useEnsResolver } from '@/hooks/useEns'
import { CONTRACT_ABI } from '@/lib/contract'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

interface Props {
  contractAddress: Address | null
}

export function DelegateManager({ contractAddress }: Props) {
  const { address }            = useAccount()
  const publicClient           = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { toast }              = useToast()
  const ens                    = useEnsResolver()

  const [delegates,     setDelegates]     = useState<string[]>([])
  const [inputDelegate, setInputDelegate] = useState('')
  const [loading,       setLoading]       = useState(false)
  const [loadingList,   setLoadingList]   = useState(true)

  const loadDelegates = async () => {
    if (!contractAddress || !publicClient) return
    setLoadingList(true)
    try {
      const contract = getContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        client: publicClient,
      })
      const list = await contract.read.getDelegates() as string[]
      setDelegates(list)
    } catch { /* best effort */ }
    finally { setLoadingList(false) }
  }

  useEffect(() => { loadDelegates() }, [contractAddress, publicClient])

  const handleAdd = async () => {
    if (!contractAddress || !walletClient || !publicClient) return

    let finalAddress = inputDelegate.trim()
    if (!(/^0x[0-9a-fA-F]{40}$/.test(finalAddress))) {
      const resolved = await ens.resolve(finalAddress)
      if (!resolved) { toast('warn', 'Invalid address or ENS name.'); return }
      finalAddress = resolved
    }

    if (delegates.map(d => d.toLowerCase()).includes(finalAddress.toLowerCase())) {
      toast('warn', 'This address is already a delegate.')
      return
    }

    setLoading(true)
    try {
      const contract = getContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        client: { public: publicClient, wallet: walletClient },
      })
      const hash = await contract.write.addDelegate([finalAddress as Address])
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
      setInputDelegate('')
      ens.reset()
      await loadDelegates()
      toast('ok', 'Delegate added successfully.')
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Failed to add delegate')
    } finally { setLoading(false) }
  }

  const handleRemove = async (delegate: string) => {
    if (!contractAddress || !walletClient || !publicClient) return
    if (!window.confirm(`Remove delegate ${delegate.slice(0,6)}…${delegate.slice(-4)}?`)) return
    setLoading(true)
    try {
      const contract = getContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        client: { public: publicClient, wallet: walletClient },
      })
      const hash = await contract.write.removeDelegate([delegate as Address])
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
      await loadDelegates()
      toast('ok', 'Delegate removed.')
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Failed to remove delegate')
    } finally { setLoading(false) }
  }

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Info */}
      <div style={{
        fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6,
        padding: '0.65rem 0.9rem', borderRadius: 8,
        background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)',
      }}>
        🩺 Delegates can upload and update records on your behalf. They cannot grant access, revoke grants, or manage other delegates.
      </div>

      {/* Current delegates */}
      {loadingList ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text3)', textAlign: 'center', padding: '1rem' }}>
          Loading delegates…
        </div>
      ) : delegates.length === 0 ? (
        <div style={{
          fontSize: '0.82rem', color: 'var(--text3)', textAlign: 'center',
          padding: '1.5rem', border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          No delegates added yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {delegates.map(d => (
            <div key={d} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.875rem', borderRadius: 9,
              background: 'var(--s2)', border: '1px solid var(--border)',
              gap: '0.75rem', flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(0,229,204,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.9rem', flexShrink: 0,
                }}>🩺</div>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{short(d)}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Delegate · Can upload records</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <a href={`${EXPLORER}/address/${d}`} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">View ↗</Button>
                </a>
                <Button variant="danger" size="sm" loading={loading} onClick={() => handleRemove(d)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add delegate */}
      <div>
        <Field label="Add Delegate" hint="Enter a wallet address or ENS name.">
          <div style={{ position: 'relative' }}>
            <Input
              value={inputDelegate}
              placeholder="0x… or doctor.eth"
              style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', paddingRight: '5rem' }}
              onChange={e => { setInputDelegate(e.target.value); ens.reset() }}
              onBlur={async () => {
                const val = inputDelegate.trim()
                if (!val || /^0x[0-9a-fA-F]{40}$/.test(val)) return
                const resolved = await ens.resolve(val)
                if (resolved) setInputDelegate(resolved)
              }}
            />
            <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem' }}>
              {ens.resolving && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--teal)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
              {ens.ensName && !ens.resolving && <span style={{ color: 'var(--green)' }}>✓ {ens.ensName}</span>}
            </div>
          </div>
        </Field>
        <Button loading={loading} onClick={handleAdd} disabled={!inputDelegate}>
          ➕ Add Delegate
        </Button>
      </div>
    </div>
  )
}