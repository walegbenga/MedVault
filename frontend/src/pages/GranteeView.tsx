import React, { useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { getContract, type Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useGranteeKey } from '@/hooks/useEncryptionKey'
import { CONTRACT_ABI } from '@/lib/contract'
import { decryptAesKeyFromEnvelope, decrypt } from '@/lib/crypto'
import { fetchBlobForGrantee } from '@/lib/ipfs'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

interface SharedRecord {
  id: string
  ipfsCid: string
  type: string
  title: string
  notes: string
  decrypted: boolean
}

export function GranteeView() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { toast } = useToast()
  const { granteeSig, loading: sigLoading, deriveGranteeKey } = useGranteeKey()

  const [patientContract, setPatientContract] = useState('')
  const [checking, setChecking] = useState(false)
  const [records, setRecords]   = useState<SharedRecord[]>([])
  const [step, setStep]         = useState<'sign' | 'enter' | 'view'>('sign')

  const handleSign = async () => {
    const sig = await deriveGranteeKey()
    if (sig) setStep('enter')
  }

  const handleCheck = async () => {
  if (!address || !publicClient || !granteeSig) return
  if (!/^0x[0-9a-fA-F]{40}$/.test(patientContract)) {
    toast('warn', 'Enter a valid contract address (0x…)')
    return
  }
  setChecking(true)
  try {
    const contract = getContract({
      address: patientContract as Address,
      abi: CONTRACT_ABI,
      client: publicClient,
    })

    const recordCount = await contract.read.getRecordCount() as bigint
    console.log('Total records:', Number(recordCount))

    const accessible: SharedRecord[] = []

    for (let i = 0; i < Number(recordCount); i++) {
      const rid = await contract.read.recordIds([i]) as `0x${string}`

      const hasAccess = await contract.read.canAccess([address, rid]) as boolean
      console.log(`Record ${i} ${rid.slice(0,10)}… canAccess: ${hasAccess}`)
      if (!hasAccess) continue

      // Fetch record — returned as array tuple by viem
      const recRaw = await contract.read.records([rid])
      console.log('recRaw:', recRaw)

      // viem returns mapping structs as an object or array depending on ABI
      // Handle both cases
      let ipfsCid = ''
      let recordType = ''
      let title = ''
      let active = false

      if (Array.isArray(recRaw)) {
        // tuple: [contentHash, ipfsCid, recordType, title, timestamp, active]
        ipfsCid     = recRaw[1] as string
        recordType  = recRaw[2] as string
        title       = recRaw[3] as string
        active      = recRaw[5] as boolean
      } else {
        const r = recRaw as Record<string, unknown>
        ipfsCid    = r.ipfsCid    as string
        recordType = r.recordType as string
        title      = r.title      as string
        active     = r.active     as boolean
      }

      console.log(`  ipfsCid: ${ipfsCid}, active: ${active}`)
      if (!active) continue

      let notes = ''
      let decrypted = false

      try {
        const blobRaw = await fetchBlobForGrantee(ipfsCid)
        console.log(`  Blob found: ${!!blobRaw}`)

        if (blobRaw) {
          const blob = JSON.parse(blobRaw)
          console.log('  SharedKeys:', Object.keys(blob.sharedKeys ?? {}))

          const envelope =
            blob.sharedKeys?.[address.toLowerCase()] ??
            blob.sharedKeys?.[address]

          console.log(`  Envelope found: ${!!envelope}`)

          if (envelope) {
            const aesKey = await decryptAesKeyFromEnvelope(envelope, granteeSig)
            const plain  = await decrypt({ ciphertext: blob.enc, iv: blob.iv }, aesKey)
            const meta   = JSON.parse(plain)
            notes     = meta.notes ?? ''
            decrypted = true
            console.log('  Decrypted successfully')
          }
        }
      } catch (decryptErr) {
        console.warn('  Decryption failed:', decryptErr)
      }

      accessible.push({ id: rid, ipfsCid, type: recordType, title, notes, decrypted })
      console.log(`  Added to accessible: ${title}`)
    }

    console.log('Final accessible count:', accessible.length)
    setRecords(accessible)
    setStep('view')

    if (accessible.length === 0) {
      toast('warn', `${Number(recordCount)} record(s) found but none accessible. Check console.`)
    } else {
      toast('ok', `Found ${accessible.length} accessible record${accessible.length !== 1 ? 's' : ''}.`)
    }
  } catch (e: unknown) {
    console.error('handleCheck error:', e)
    toast('err', e instanceof Error ? e.message : 'Failed to check access')
  } finally {
    setChecking(false)
  }
}

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  const S = {
    card: { background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 14, padding: '1.75rem' } as React.CSSProperties,
    infoTeal: { fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.25rem', background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)', color: 'var(--text2)' } as React.CSSProperties,
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.4rem' }}>🔑 Grantee View</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65 }}>
          Access health records shared with your wallet{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{address ? short(address) : ''}</span>.
        </p>
      </div>

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
                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, background: isDone ? 'rgba(0,230,118,0.12)' : isActive ? 'rgba(0,229,204,0.12)' : 'var(--s2)', border: `1px solid ${isDone ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--border)'}`, color: isDone ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--text3)' }}>
                  {isDone ? '✓' : s.n}
                </div>
                <span style={{ fontSize: '0.8rem', color: isActive ? 'var(--text)' : 'var(--text3)' }}>{s.label}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />}
            </React.Fragment>
          )
        })}
      </div>

      {/* Signature display — always show after signing */}
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
            Sign a message with your wallet to derive a decryption key. Free — no transaction is sent.
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
            The patient should give you their MedVaultRegistry contract address. Paste it below.
          </p>
          <Field label="Patient's Registry Contract Address" required>
            <Input value={patientContract} onChange={e => setPatientContract(e.target.value)} placeholder="0x…" style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }} />
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

          {records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.4rem' }}>No accessible records</div>
              <div style={{ fontSize: '0.82rem' }}>The patient hasn't granted your wallet access, or has revoked it.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.9rem' }}>
              {records.map((r, i) => (
                <div key={r.id} style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem', animation: `fadeUp 0.22s ease ${i * 0.05}s both` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                    <span style={{ fontSize: '0.67rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,229,204,0.1)', color: 'var(--teal)', border: '1px solid rgba(0,229,204,0.2)' }}>
                      {r.type}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: r.decrypted ? 'var(--green)' : 'var(--amber)' }}>
                      {r.decrypted ? '🔓 Decrypted' : '🔒 Metadata only'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{r.title}</div>

                  {r.decrypted && r.notes && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6, padding: '0.65rem', background: 'var(--s2)', borderRadius: 7, marginBottom: '0.75rem' }}>
                      {r.notes}
                    </div>
                  )}

                  {!r.decrypted && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--amber)', padding: '0.55rem', background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.2)', borderRadius: 7, marginBottom: '0.75rem' }}>
                      ⚠ Ask the patient to re-grant access using the latest MedVault so the decryption key is shared with you.
                    </div>
                  )}

                  <a href={`${EXPLORER}/address/${patientContract}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none' }}>
                    View on BaseScan ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}