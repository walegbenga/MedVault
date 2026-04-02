import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useEnsResolver } from '@/hooks/useEns'
import { CONTRACT_ABI } from '@/lib/contract'
import { encryptAesKeyForGrantee } from '@/lib/crypto'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

interface Props {
  contractAddress: Address | null
  encKey: CryptoKey | null
}

export function DelegateManager({ contractAddress, encKey }: Props) {
  const { address }            = useAccount()
  const publicClient           = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { toast }              = useToast()
  const ens                    = useEnsResolver()

  const [delegates,      setDelegates]      = useState<string[]>([])
  const [inputDelegate,  setInputDelegate]  = useState('')
  const [delegateSig,    setDelegateSig]    = useState('')
  const [loading,        setLoading]        = useState(false)
  const [loadingList,    setLoadingList]    = useState(true)

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
    if (!encKey) { toast('err', 'Encryption key not ready.'); return }

    let finalAddress = inputDelegate.trim()
    if (!(/^0x[0-9a-fA-F]{40}$/.test(finalAddress))) {
      const resolved = await ens.resolve(finalAddress)
      if (!resolved) { toast('warn', 'Invalid address or ENS name.'); return }
      finalAddress = resolved
    }

    if (!delegateSig.startsWith('0x')) {
      toast('warn', 'Delegate signature is required. Ask the delegate to sign in VeriHealth as a Delegate and send you their signature.')
      return
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

      // Step 1: Add delegate on-chain
      const addHash = await contract.write.addDelegate([finalAddress as Address])
      await publicClient.waitForTransactionReceipt({ hash: addHash, confirmations: 1, timeout: 120_000 })

      // Step 2: Encrypt patient AES key for delegate using delegate's signature
      const envelope = await encryptAesKeyForGrantee(encKey, delegateSig)

      // Step 3: Store key envelope on-chain so delegate can decrypt patient records
      const envHash = await contract.write.setDelegateKeyEnvelope([
        finalAddress as Address,
        envelope.ciphertext,
        envelope.iv,
      ])
      await publicClient.waitForTransactionReceipt({ hash: envHash, confirmations: 1, timeout: 120_000 })

      setInputDelegate('')
      setDelegateSig('')
      ens.reset()
      await loadDelegates()
      toast('ok', 'Delegate added and encryption key shared successfully.')
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
      <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6, padding: '0.65rem 0.9rem', borderRadius: 8, background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)' }}>
        🩺 Delegates can upload and update records on your behalf using your encryption key.
        They cannot grant access, revoke grants, or manage other delegates.
      </div>

      {/* How it works */}
      <div style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.65, padding: '0.65rem 0.9rem', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>How to add a delegate:</div>
        <div>1. Ask the delegate to open VeriHealth, select <strong>"I'm a Delegate"</strong>, click <strong>"Sign to Unlock"</strong>, and send you their signature.</div>
        <div>2. Paste their wallet address and signature below.</div>
        <div>3. Click Add Delegate — this stores your encryption key securely for them on-chain.</div>
      </div>

      {/* Current delegates */}
      {loadingList ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text3)', textAlign: 'center', padding: '1rem' }}>
          Loading delegates…
        </div>
      ) : delegates.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text3)', textAlign: 'center', padding: '1.5rem', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No delegates added yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {delegates.map(d => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.875rem', borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--border)', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,229,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>🩺</div>
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
        <Field label="Delegate Wallet Address or ENS" required>
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

        <Field
          label="Delegate Signature"
          required
          hint="Ask the delegate to open VeriHealth, select 'I'm a Delegate', click 'Sign to Unlock', and copy their signature to you."
        >
          <textarea
            value={delegateSig}
            onChange={e => setDelegateSig(e.target.value.trim())}
            placeholder="0x… (paste delegate's signature)"
            style={{
              width: '100%', padding: '0.55rem 0.875rem', borderRadius: 8,
              fontSize: '0.72rem', background: 'var(--bg)',
              border: '1px solid var(--border2)', color: 'var(--text)',
              fontFamily: 'var(--mono)', resize: 'vertical' as const,
              minHeight: 70, boxSizing: 'border-box' as const,
            }}
          />
        </Field>

        <Button loading={loading} onClick={handleAdd} disabled={!inputDelegate || !delegateSig || !encKey}>
          ➕ Add Delegate
        </Button>

        {!encKey && (
          <div style={{ fontSize: '0.75rem', color: 'var(--amber)', marginTop: '0.5rem' }}>
            ⚠ Encryption key required to add a delegate. Sign the encryption message first.
          </div>
        )}
      </div>
    </div>
  )
}