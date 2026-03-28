import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { CONTRACT_ABI } from '@/lib/contract'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

interface Props {
  contractAddress: Address | null
}

export function EmergencyAccess({ contractAddress }: Props) {
  const { address }              = useAccount()
  const publicClient             = usePublicClient()
  const { data: walletClient }   = useWalletClient()
  const { toast }                = useToast()

  const [emergencyContact,   setEmergencyContact]   = useState<string>('')
  const [inputContact,       setInputContact]       = useState('')
  const [emergencyActive,    setEmergencyActive]    = useState(false)
  const [activatedAt,        setActivatedAt]        = useState<number>(0)
  const [loading,            setLoading]            = useState(false)
  const [loadingStatus,      setLoadingStatus]      = useState(true)

  // Load current emergency status from contract
  useEffect(() => {
    if (!contractAddress || !publicClient) return
    const load = async () => {
      setLoadingStatus(true)
      try {
        const contract = getContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          client: publicClient,
        })
        const [contact, active, activatedAtRaw] = await Promise.all([
          contract.read.emergencyContact() as Promise<string>,
          contract.read.emergencyActive()  as Promise<boolean>,
          contract.read.emergencyActivatedAt() as Promise<bigint>,
        ])
        setEmergencyContact(contact === '0x0000000000000000000000000000000000000000' ? '' : contact)
        setEmergencyActive(active)
        setActivatedAt(Number(activatedAtRaw))
      } catch { /* contract may not have these yet */ }
      finally { setLoadingStatus(false) }
    }
    load()
  }, [contractAddress, publicClient])

  const handleSetContact = async () => {
    if (!contractAddress || !walletClient || !publicClient) return
    if (!/^0x[0-9a-fA-F]{40}$/.test(inputContact)) {
      toast('warn', 'Enter a valid wallet address.')
      return
    }
    setLoading(true)
    try {
      const contract = getContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        client: { public: publicClient, wallet: walletClient },
      })
      const hash = await contract.write.setEmergencyContact([inputContact as Address])
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
      setEmergencyContact(inputContact)
      setInputContact('')
      toast('ok', 'Emergency contact set successfully.')
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Failed to set contact')
    } finally { setLoading(false) }
  }

  const handleDeactivate = async () => {
    if (!contractAddress || !walletClient || !publicClient) return
    if (!window.confirm('Deactivate emergency access?')) return
    setLoading(true)
    try {
      const contract = getContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        client: { public: publicClient, wallet: walletClient },
      })
      const hash = await contract.write.deactivateEmergency([])
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
      setEmergencyActive(false)
      setActivatedAt(0)
      toast('ok', 'Emergency access deactivated.')
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Failed to deactivate')
    } finally { setLoading(false) }
  }

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  if (loadingStatus) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>
        Loading emergency access status…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Status banner */}
      {emergencyActive && (
        <div style={{
          padding: '0.875rem 1rem', borderRadius: 10,
          background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🚨</span>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--red)' }}>
                Emergency Access is Active
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                Activated {activatedAt ? new Date(activatedAt * 1000).toLocaleString() : 'recently'}
              </div>
            </div>
          </div>
          <Button variant="danger" size="sm" loading={loading} onClick={handleDeactivate}>
            Deactivate
          </Button>
        </div>
      )}

      {/* Current contact */}
      {emergencyContact ? (
        <div style={{
          padding: '0.875rem 1rem', borderRadius: 10,
          background: 'var(--s2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(255,68,68,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', flexShrink: 0,
            }}>🚑</div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Emergency Contact</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)' }}>
                {short(emergencyContact)}
              </div>
            </div>
          </div>
          
            <a href={`${EXPLORER}/address/${emergencyContact}`}
            target="_blank" rel="noreferrer"
          >
            <Button variant="outline" size="sm">View ↗</Button>
          </a>
        </div>
      ) : (
        <div style={{
          padding: '0.875rem 1rem', borderRadius: 10,
          background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.2)',
          fontSize: '0.82rem', color: '#ffd080',
        }}>
          ⚠ No emergency contact set. Your records cannot be accessed in an emergency.
        </div>
      )}

      {/* Set/update contact */}
      <div>
        <Field
          label={emergencyContact ? 'Update Emergency Contact' : 'Set Emergency Contact'}
          hint="This wallet can activate emergency access to all your records if you are incapacitated."
        >
          <Input
            value={inputContact}
            placeholder="0x…"
            style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
            onChange={e => setInputContact(e.target.value.trim())}
          />
        </Field>
        <Button loading={loading} onClick={handleSetContact} disabled={!inputContact}>
          {emergencyContact ? '🔄 Update Contact' : '🚑 Set Emergency Contact'}
        </Button>
      </div>

      {/* Info */}
      <div style={{
        fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.65,
        padding: '0.75rem', borderRadius: 8,
        background: 'var(--s2)', border: '1px solid var(--border)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>How emergency access works:</div>
        <div>1. You designate a trusted wallet as your emergency contact (e.g. a family member or doctor).</div>
        <div>2. If you are incapacitated, they call <code style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>activateEmergency()</code> from their wallet.</div>
        <div>3. They can then view all your active records in VeriHealth using the Grantee view.</div>
        <div>4. You can deactivate emergency access at any time from this panel.</div>
      </div>
    </div>
  )
}