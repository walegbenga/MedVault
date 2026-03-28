import React, { useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address, createPublicClient, http } from 'viem'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useGranteeKey } from '@/hooks/useEncryptionKey'
import { useEnsResolver, useEnsName } from '@/hooks/useEns'
import { useIsMobile } from '@/hooks/useIsMobile'
import { CONTRACT_ABI } from '@/lib/contract'
import { decryptAesKeyFromEnvelope, decrypt } from '@/lib/crypto'
import { fetchBlob } from '@/lib/ipfs'
import { FileViewer } from '@/components/FileViewer'
import { QRGrantee } from '@/components/QRGrantee'
import { targetChain } from '@/lib/wagmi'
import { env } from '@/env'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

const rpcUrl = env.rpcUrl || (
  env.network === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'
)

interface SharedRecord {
  id: string
  ipfsCid: string
  type: string
  title: string
  notes: string
  decrypted: boolean
  expiresAt: number
  fileData: { name: string; size: number; data: string } | null
}

function getExpiryStatus(expiresAt: number): {
  label: string; color: string; urgent: boolean
} | null {
  if (!expiresAt || expiresAt === 0) return null
  const now       = Date.now()
  const expiresMs = expiresAt * 1000
  const diffMs    = expiresMs - now
  const diffDays  = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs <= 0)    return { label: 'Expired',                     color: 'var(--red)',   urgent: true  }
  if (diffDays <= 1)  return { label: 'Expires today',               color: 'var(--red)',   urgent: true  }
  if (diffDays <= 3)  return { label: `Expires in ${diffDays} days`, color: 'var(--amber)', urgent: true  }
  if (diffDays <= 7)  return { label: `Expires in ${diffDays} days`, color: 'var(--amber)', urgent: false }
  if (diffDays <= 30) return { label: `Expires in ${diffDays} days`, color: 'var(--text3)', urgent: false }
  return { label: `Expires ${new Date(expiresMs).toLocaleDateString()}`, color: 'var(--text3)', urgent: false }
}

export function GranteeView() {
  const { address }           = useAccount()
  const publicClient          = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { toast }             = useToast()
  const isMobile              = useIsMobile()
  const { granteeSig, loading: sigLoading, deriveGranteeKey } = useGranteeKey()
  const ens                   = useEnsResolver()
  const walletEnsName         = useEnsName(address)

  const [patientContract, setPatientContract] = useState('')
  const [checking,        setChecking]        = useState(false)
  const [records,         setRecords]         = useState<SharedRecord[]>([])
  const [step,            setStep]            = useState<'sign' | 'enter' | 'view'>('sign')

  // Emergency
  const [emergencyContract,  setEmergencyContract]  = useState('')
  const [activatingEmergency, setActivatingEmergency] = useState(false)
  const [showEmergencyPanel,  setShowEmergencyPanel]  = useState(false)

  // File viewer
  const [fileViewerOpen, setFileViewerOpen] = useState(false)
  const [viewFile,       setViewFile]       = useState<{ name: string; size: number; data: string } | null>(null)
  const [viewFileTitle,  setViewFileTitle]  = useState('')

  const handleSign = async () => {
    const sig = await deriveGranteeKey()
    if (sig) setStep('enter')
  }

  const handleCheck = async () => {
    if (!address || !granteeSig) return

    let contractAddr = patientContract.trim()
    if (!(/^0x[0-9a-fA-F]{40}$/.test(contractAddr))) {
      const resolved = await ens.resolve(contractAddr)
      if (!resolved) { toast('warn', 'Enter a valid contract address or ENS name.'); return }
      contractAddr = resolved
      setPatientContract(resolved)
    }

    setChecking(true)
    try {
      const reliableClient = createPublicClient({
        chain: targetChain,
        transport: http(rpcUrl, { batch: true, retryCount: 5, retryDelay: 1000 }),
      })

      const contract = getContract({
        address: contractAddr as Address,
        abi: CONTRACT_ABI,
        client: reliableClient,
      })

      const accessibleIds = await contract.read.accessibleRecords([address]) as `0x${string}`[]

      if (accessibleIds.length === 0) {
        setRecords([])
        setStep('view')
        toast('warn', `No records accessible to ${address.slice(0,6)}…${address.slice(-4)}`)
        return
      }

      // Build expiry map
      const expiryMap: Record<string, number> = {}
      try {
        const grantCount = await contract.read.getGrantCount() as bigint
        for (let i = 0; i < Number(grantCount); i++) {
          const grantRaw  = await contract.read.grants([BigInt(i)]) as unknown[]
          const grantee   = grantRaw[0] as string
          const expiresAt = Number(grantRaw[1] as bigint)
          const active    = grantRaw[2] as boolean
          if (!active) continue
          if (grantee.toLowerCase() !== address.toLowerCase()) continue
          const grantRecordIds = await contract.read.getGrantRecordIds([BigInt(i)]) as `0x${string}`[]
          for (const rid of grantRecordIds) {
            expiryMap[rid.toLowerCase()] = expiresAt
          }
        }
      } catch { /* best effort */ }

      // Fetch records + envelopes in parallel
      const settled = await Promise.allSettled(
        accessibleIds.map(async (rid) => {
          const [recRaw, envelopeRaw] = await Promise.all([
            contract.read.records([rid]),
            contract.read.getKeyEnvelope([address, rid]),
          ])

          let ipfsCid    = ''
          let recordType = ''
          let title      = ''
          let active     = false

          if (Array.isArray(recRaw)) {
            ipfsCid    = recRaw[1] as string
            recordType = recRaw[2] as string
            title      = recRaw[3] as string
            active     = recRaw[5] as boolean
          } else {
            const r    = recRaw as Record<string, unknown>
            ipfsCid    = r.ipfsCid    as string
            recordType = r.recordType as string
            title      = r.title      as string
            active     = r.active     as boolean
          }

          if (!active) return null

          const [ciphertext, iv, exists] = envelopeRaw as [string, string, boolean]

          let notes     = ''
          let decrypted = false
          let fileData: SharedRecord['fileData'] = null

          if (exists && ciphertext && iv) {
            try {
              const aesKey  = await decryptAesKeyFromEnvelope({ ciphertext, iv }, granteeSig)
              const blobRaw = await fetchBlob(ipfsCid)
              if (blobRaw) {
                const blob = JSON.parse(blobRaw)
                if (blob.enc && blob.iv) {
                  const plain = await decrypt({ ciphertext: blob.enc, iv: blob.iv }, aesKey)
                  const meta  = JSON.parse(plain)
                  notes     = meta.notes ?? ''
                  decrypted = true
                  // Extract file if present
                  if (blob.file) fileData = blob.file
                }
              }
            } catch (e) {
              console.warn('Decryption failed for', rid, e)
            }
          }

          return {
            id: rid, ipfsCid, type: recordType, title,
            notes, decrypted, fileData,
            expiresAt: expiryMap[rid.toLowerCase()] ?? 0,
          } as SharedRecord
        })
      )

      const accessible = settled
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter((r): r is SharedRecord => r !== null)

      accessible.sort((a, b) =>
        accessibleIds.indexOf(a.id as `0x${string}`) -
        accessibleIds.indexOf(b.id as `0x${string}`)
      )

      setRecords(accessible)
      setStep('view')

      if (accessible.length === 0) {
        toast('warn', 'Records found but none are active.')
      } else {
        toast('ok', `Found ${accessible.length} accessible record${accessible.length !== 1 ? 's' : ''}.`)
      }

    } catch (e: unknown) {
      console.error('handleCheck error:', e)
      const msg = e instanceof Error ? e.message : 'Failed to check access'
      toast('err', msg.length > 120 ? msg.slice(0, 120) + '…' : msg)
    } finally {
      setChecking(false)
    }
  }

  const handleActivateEmergency = async () => {
    if (!address || !publicClient || !walletClient) return
    if (!/^0x[0-9a-fA-F]{40}$/.test(emergencyContract)) {
      toast('warn', 'Enter a valid contract address.')
      return
    }
    if (!window.confirm('Activate emergency access? This will be recorded on-chain.')) return
    setActivatingEmergency(true)
    try {
      const contract = getContract({
        address: emergencyContract as Address,
        abi: CONTRACT_ABI,
        client: { public: publicClient, wallet: walletClient },
      })
      const hash = await contract.write.activateEmergency([])
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
      toast('ok', 'Emergency access activated. You can now view all records.')
      setPatientContract(emergencyContract)
      setShowEmergencyPanel(false)
      // Proceed to record check
      await handleCheck()
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Failed to activate emergency access')
    } finally {
      setActivatingEmergency(false)
    }
  }

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  const S = {
    card:      { background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 14, padding: '1.75rem' } as React.CSSProperties,
    infoTeal:  { fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.25rem', background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)', color: 'var(--text2)' } as React.CSSProperties,
    infoAmber: { fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.25rem', background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.22)', color: '#ffd080' } as React.CSSProperties,
    infoRed:   { fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.25rem', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.25)', color: '#ff9999' } as React.CSSProperties,
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.4rem' }}>
          🔑 Grantee View
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65 }}>
          Access health records shared with your wallet{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
            {walletEnsName ?? (address ? short(address) : '')}
          </span>
          {' '}on <strong>{targetChain.name}</strong>.
        </p>
      </div>

      {/* Emergency access toggle */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => setShowEmergencyPanel(p => !p)}
          style={{
            fontSize: '0.78rem', padding: '0.35rem 0.875rem', borderRadius: 8,
            background: 'rgba(255,68,68,0.08)', color: '#ff9999',
            border: '1px solid rgba(255,68,68,0.25)', cursor: 'pointer',
            fontFamily: 'var(--font)', fontWeight: 600,
          }}
        >
          🚨 Emergency Access
        </button>
      </div>

      {/* Emergency panel */}
      {showEmergencyPanel && (
        <div style={{ ...S.infoRed, marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            🚨 Activate Emergency Access
          </div>
          <p style={{ marginBottom: '0.75rem', lineHeight: 1.6 }}>
            Only use this if you are the designated emergency contact for the patient and they are incapacitated.
            This action is recorded permanently on-chain.
          </p>
          <Field label="Patient Registry Contract Address">
            <Input
              value={emergencyContract}
              onChange={e => setEmergencyContract(e.target.value.trim())}
              placeholder="0x…"
              style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
            />
          </Field>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Button
              variant="danger"
              loading={activatingEmergency}
              onClick={handleActivateEmergency}
              disabled={!emergencyContract}
            >
              🚨 Activate Emergency Access
            </Button>
            <Button variant="outline" onClick={() => setShowEmergencyPanel(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
        {[
          { n: 1, label: 'Sign to unlock', id: 'sign' },
          { n: 2, label: 'Enter patient contract', id: 'enter' },
          { n: 3, label: 'View records', id: 'view' },
        ].map((s, i) => {
          const isDone   = (step === 'enter' && s.id === 'sign') || (step === 'view' && s.id !== 'view')
          const isActive = step === s.id
          return (
            <React.Fragment key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 700,
                  background: isDone ? 'rgba(0,230,118,0.12)' : isActive ? 'rgba(0,229,204,0.12)' : 'var(--s2)',
                  border: `1px solid ${isDone ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--border)'}`,
                  color: isDone ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--text3)',
                }}>
                  {isDone ? '✓' : s.n}
                </div>
                {!isMobile && (
                  <span style={{ fontSize: '0.8rem', color: isActive ? 'var(--text)' : 'var(--text3)' }}>
                    {s.label}
                  </span>
                )}
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />}
            </React.Fragment>
          )
        })}
      </div>

      {/* Signature display */}
      {granteeSig && step !== 'sign' && (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--amber)' }}>
            📋 Share this signature with the patient
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
            The patient must paste this into the "Grantee Signature" field when granting you access.
          </p>
          <div
            onClick={() => navigator.clipboard.writeText(granteeSig).then(() => toast('ok', 'Copied!'))}
            style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--teal)', background: 'var(--s2)', padding: '0.65rem 0.875rem', borderRadius: 7, wordBreak: 'break-all', cursor: 'pointer', border: '1px solid var(--border)' }}
            title="Click to copy"
          >
            {granteeSig}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '0.4rem' }}>Click to copy</div>
        </div>
      )}

      {/* Step 1 */}
      {step === 'sign' && (
        <div style={S.card}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Step 1: Sign to derive your decryption key</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            Sign a message with your wallet to derive a decryption key unique to your address. This is free — no transaction is sent.
          </p>
          <div style={S.infoTeal}>🔐 Free off-chain signature. No gas spent.</div>
          <Button onClick={handleSign} loading={sigLoading}>✍️ Sign to Unlock</Button>
        </div>
      )}

      {/* Step 2 */}
      {step === 'enter' && (
        <div style={S.card}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Step 2: Enter the patient's contract address</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            Ask the patient to click <strong>"📋 Copy for Grantee"</strong> or <strong>"📱 Show QR"</strong> in their dashboard.
          </p>
          <div style={S.infoAmber}>
            ⚠ Make sure you are connected to <strong>{targetChain.name}</strong> before checking.
          </div>
          <Field label="Patient's Registry Contract Address or ENS" required>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Input
                  value={patientContract}
                  onChange={e => { setPatientContract(e.target.value.trim()); ens.reset() }}
                  onBlur={async () => {
                    const val = patientContract.trim()
                    if (!val || /^0x[0-9a-fA-F]{40}$/.test(val)) return
                    const resolved = await ens.resolve(val)
                    if (resolved) setPatientContract(resolved)
                  }}
                  placeholder="0x… or patient.eth"
                  style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
                />
              </div>
              <QRGrantee
                mode="scan"
                onScanned={addr => { setPatientContract(addr); ens.reset() }}
              />
            </div>
            {ens.ensName && ens.resolved && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: '0.35rem', fontFamily: 'var(--mono)', padding: '0.3rem 0.6rem', background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 6 }}>
                ✅ {ens.ensName} → {ens.resolved}
              </div>
            )}
            {ens.error && (
              <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.35rem', padding: '0.3rem 0.6rem', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 6 }}>
                ✗ {ens.error}
              </div>
            )}
          </Field>
          <Button onClick={handleCheck} loading={checking}>🔍 Check My Access</Button>
        </div>
      )}

      {/* Step 3 */}
      {step === 'view' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Accessible Records ({records.length})</h3>
            <Button variant="outline" size="sm" onClick={() => { setStep('enter'); setRecords([]) }}>← Try Another</Button>
          </div>

          <div style={{ fontSize: '0.8rem', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.25rem', background: 'rgba(0,82,255,0.06)', border: '1px solid rgba(0,82,255,0.2)', color: '#8ab4ff' }}>
            📋 Contract:{' '}
            <a href={`${EXPLORER}/address/${patientContract}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontSize: '0.75rem' }}>
              {patientContract}
            </a>
          </div>

          {/* Expiry summary banner */}
          {records.some(r => getExpiryStatus(r.expiresAt)?.urgent) && (
            <div style={{ fontSize: '0.82rem', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)', color: '#ff9999', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🚨</span>
              <span>Some of your access grants are expiring soon or have already expired. Contact the patient to renew your access.</span>
            </div>
          )}

          {records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.4rem' }}>No accessible records</div>
              <div style={{ fontSize: '0.82rem' }}>The patient hasn't granted your wallet access, or access has been revoked.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.9rem' }}>
              {records.map((r, i) => {
                const expiry = getExpiryStatus(r.expiresAt)
                return (
                  <div key={r.id} style={{
                    background: 'var(--s1)',
                    border: `1px solid ${expiry?.urgent ? 'rgba(255,68,68,0.3)' : 'var(--border)'}`,
                    borderRadius: 12, padding: '1.1rem',
                    animation: `fadeUp 0.22s ease ${i * 0.05}s both`,
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  }}>
                    {/* Type + status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '0.67rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,229,204,0.1)', color: 'var(--teal)', border: '1px solid rgba(0,229,204,0.2)' }}>
                        {r.type}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: r.decrypted ? 'var(--green)' : 'var(--amber)' }}>
                        {r.decrypted ? '🔓 Decrypted' : '🔒 Metadata only'}
                      </span>
                    </div>

                    {/* Title */}
                    <div style={{ fontWeight: 600 }}>{r.title}</div>

                    {/* Expiry */}
                    {expiry && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: expiry.color, padding: '0.35rem 0.65rem', borderRadius: 6, background: expiry.urgent ? 'rgba(255,68,68,0.06)' : 'rgba(255,179,0,0.05)', border: `1px solid ${expiry.urgent ? 'rgba(255,68,68,0.2)' : 'rgba(255,179,0,0.15)'}` }}>
                        {expiry.urgent ? '🚨' : '⏰'} {expiry.label}
                      </div>
                    )}

                    {/* Notes */}
                    {r.decrypted && r.notes && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6, padding: '0.65rem', background: 'var(--s2)', borderRadius: 7 }}>
                        {r.notes}
                      </div>
                    )}

                    {/* No key */}
                    {!r.decrypted && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--amber)', padding: '0.55rem', background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 7 }}>
                        ⚠ No decryption key found. Ask the patient to grant access again.
                      </div>
                    )}

                    {/* File attachment */}
                    {r.decrypted && r.fileData && (
                      <button
                        onClick={() => {
                          setViewFile(r.fileData)
                          setViewFileTitle(r.title)
                          setFileViewerOpen(true)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8,
                          background: 'var(--s2)', border: '1px solid var(--border2)',
                          cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                      >
                        <span style={{ fontSize: '1rem' }}>📎</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.fileData.name}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
                            {(r.fileData.size / 1024).toFixed(1)} KB · Click to view
                          </div>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--teal)', flexShrink: 0 }}>Open →</span>
                      </button>
                    )}

                    {/* BaseScan link */}
                    
                      <a href={`${EXPLORER}/address/${patientContract}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none' }}
                    >
                      View on BaseScan ↗
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* File Viewer */}
      <FileViewer
        open={fileViewerOpen}
        onClose={() => setFileViewerOpen(false)}
        file={viewFile}
        recordTitle={viewFileTitle}
      />
    </div>
  )
}