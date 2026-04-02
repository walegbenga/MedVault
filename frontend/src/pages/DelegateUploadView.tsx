import React, { useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address, createPublicClient, http } from 'viem'
import { keccak256, toUtf8Bytes } from 'ethers'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useGranteeKey } from '@/hooks/useEncryptionKey'
import { CONTRACT_ABI } from '@/lib/contract'
import { decryptAesKeyFromEnvelope, encrypt } from '@/lib/crypto'
import { pinBlob } from '@/lib/ipfs'
import { targetChain } from '@/lib/wagmi'
import { env } from '@/env'
import type { RecordType } from '@/lib/types'

const RECORD_TYPES = [
  'Lab Results','Prescription','Medical Imaging',
  'Doctor Visit','Vaccine Record','Surgery Report',
  'Mental Health Note','Other'
] as const

const rpcUrl = env.rpcUrl || (
  env.network === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'
)

interface UploadedRecord {
  id: string
  title: string
  type: string
  txHash: string
}

export function DelegateUploadView() {
  const { address }             = useAccount()
  const publicClient            = usePublicClient()
  const { data: walletClient }  = useWalletClient()
  const { toast }               = useToast()
  const { granteeSig, loading: sigLoading, deriveGranteeKey } = useGranteeKey()

  const [patientContract,  setPatientContract]  = useState('')
  const [isDelegate,       setIsDelegate]       = useState(false)
  const [patientAesKey,    setPatientAesKey]     = useState<CryptoKey | null>(null)
  const [checking,         setChecking]         = useState(false)
  const [uploading,        setUploading]        = useState(false)
  const [uploadedRecords,  setUploadedRecords]  = useState<UploadedRecord[]>([])
  const [step,             setStep]             = useState<'sign' | 'connect' | 'upload'>('sign')

  const [form, setForm] = useState({
    type:     '' as RecordType | '',
    title:    '',
    provider: '',
    date:     new Date().toISOString().split('T')[0],
    notes:    '',
  })
  const [file, setFile] = useState<File | null>(null)

  const handleSign = async () => {
    const sig = await deriveGranteeKey()
    if (sig) setStep('connect')
  }

  const handleCheck = async () => {
    if (!address || !publicClient || !granteeSig) return
    if (!/^0x[0-9a-fA-F]{40}$/.test(patientContract)) {
      toast('warn', 'Enter a valid contract address.')
      return
    }
    setChecking(true)
    try {
      const reliableClient = createPublicClient({
        chain: targetChain,
        transport: http(rpcUrl, { batch: true, retryCount: 3 }),
      })

      const contract = getContract({
        address: patientContract as Address,
        abi: CONTRACT_ABI,
        client: reliableClient,
      })

      // Check delegate status
      const isDel = await contract.read.delegates([address]) as boolean
      if (!isDel) {
        toast('err', 'Your wallet is not a delegate for this registry.')
        return
      }

      // Fetch delegate key envelope
      const envelopeRaw = await contract.read.getDelegateKeyEnvelope([address]) as [string, string, boolean]
      const [ciphertext, iv, exists] = envelopeRaw

      if (!exists || !ciphertext || !iv) {
        toast('err', 'No encryption key found for your delegate wallet. Ask the patient to re-add you as a delegate with your signature.')
        return
      }

      // Decrypt patient's AES key using delegate's own signature
      const aesKey = await decryptAesKeyFromEnvelope({ ciphertext, iv }, granteeSig)
      setPatientAesKey(aesKey)
      setIsDelegate(true)
      setStep('upload')
      toast('ok', 'Delegate access confirmed! You can now upload using the patient\'s encryption key.')

    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Failed to verify delegate status')
    } finally {
      setChecking(false)
    }
  }

  const handleUpload = async () => {
    if (!address || !publicClient || !walletClient) {
      toast('err', 'Wallet not connected.')
      return
    }
    if (!form.type || !form.title || !form.date) {
      toast('warn', 'Fill in Type, Title, and Date.')
      return
    }
    if (!patientAesKey) {
      toast('err', 'Patient encryption key not loaded. Please reconnect.')
      return
    }

    setUploading(true)
    try {
      // Encrypt with PATIENT'S AES key — not delegate's key
      const metadata = { ...form, wallet: address, uploadedBy: 'delegate', ts: Date.now() }
      const encrypted = await encrypt(JSON.stringify(metadata), patientAesKey)
      let payload = JSON.stringify({ enc: encrypted.ciphertext, iv: encrypted.iv })

      if (file) {
        const fileData = await new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload  = () => res((reader.result as string).split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        const parsed = JSON.parse(payload)
        parsed.file = { name: file.name, size: file.size, data: fileData }
        payload = JSON.stringify(parsed)
      }

      const ipfsCid     = await pinBlob(payload, `${form.type}: ${form.title}`)
      const contentHash = keccak256(toUtf8Bytes(payload)) as `0x${string}`

      // Write to patient's contract as delegate
      const contract = getContract({
        address: patientContract as Address,
        abi: CONTRACT_ABI,
        client: { public: publicClient, wallet: walletClient },
      })

      const hash = await contract.write.addRecord([contentHash, ipfsCid, form.type, form.title])
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })

      setUploadedRecords(prev => [...prev, {
        id:     contentHash,
        title:  form.title,
        type:   form.type as string,
        txHash: hash,
      }])

      toast('ok', `"${form.title}" uploaded to patient registry!`)
      setForm({ type: '', title: '', provider: '', date: new Date().toISOString().split('T')[0], notes: '' })
      setFile(null)

    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

  const S = {
    card:     { background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 14, padding: '1.75rem' } as React.CSSProperties,
    infoTeal: { fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.25rem', background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)', color: 'var(--text2)' } as React.CSSProperties,
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.4rem' }}>
          🩺 Delegate Upload
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65 }}>
          Upload health records to a patient's registry on their behalf.
          Records are encrypted with the patient's key so they can read them.
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
        {[
          { n: 1, label: 'Sign to unlock', id: 'sign' },
          { n: 2, label: 'Verify delegate', id: 'connect' },
          { n: 3, label: 'Upload records', id: 'upload' },
        ].map((s, i) => {
          const isDone   = (step === 'connect' && s.id === 'sign') || (step === 'upload' && s.id !== 'upload')
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
                <span style={{ fontSize: '0.8rem', color: isActive ? 'var(--text)' : 'var(--text3)' }}>
                  {s.label}
                </span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />}
            </React.Fragment>
          )
        })}
      </div>

      {/* Step 1 — Sign */}
      {step === 'sign' && (
        <div style={S.card}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Step 1: Sign to derive your key</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            Sign a free message to derive your key. This signature is also what you share with the patient
            so they can set up your delegate encryption envelope.
          </p>
          <div style={S.infoTeal}>🔐 Free off-chain signature. No gas spent.</div>
          <Button onClick={handleSign} loading={sigLoading}>✍️ Sign to Unlock</Button>
        </div>
      )}

      {/* Signature display — show after signing */}
      {granteeSig && step !== 'sign' && (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--amber)' }}>
            📋 Share this signature with the patient
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
            The patient must paste this into the "Delegate Signature" field when adding you as a delegate.
            This allows them to share their encryption key securely with you.
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

      {/* Step 2 — Verify */}
      {step === 'connect' && (
        <div style={S.card}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Step 2: Enter the patient's contract address</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            The patient must have added your wallet as a delegate with your signature first.
          </p>
          <div style={S.infoTeal}>
            🩺 Your delegate status and encryption key will be verified from the contract.
          </div>
          <Field label="Patient Registry Contract Address" required>
            <Input
              value={patientContract}
              onChange={e => setPatientContract(e.target.value.trim())}
              placeholder="0x…"
              style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
            />
          </Field>
          <Button onClick={handleCheck} loading={checking}>
            🔍 Verify Delegate Access
          </Button>
        </div>
      )}

      {/* Step 3 — Upload */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Confirmation banner */}
          <div style={{ padding: '0.875rem 1rem', borderRadius: 10, background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.2)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--green)' }}>
                Delegate access confirmed · Patient key loaded
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)' }}>
                {patientContract}
              </div>
            </div>
          </div>

          {/* Upload form */}
          <div style={S.card}>
            <h3 style={{ fontWeight: 700, marginBottom: '1rem' }}>Upload Record</h3>

            <div style={S.infoTeal}>
              🔐 Records are encrypted with the patient's key — only they and their grantees can read them.
            </div>

            <Field label="Record Type" required>
              <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as RecordType }))}>
                <option value="">Select…</option>
                {RECORD_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Title" required>
                <Input value={form.title} placeholder="e.g. Blood Panel Q4" onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </Field>
              <Field label="Date" required>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </Field>
            </div>
            <Field label="Healthcare Provider">
              <Input value={form.provider} placeholder="e.g. City General Hospital" onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} />
            </Field>
            <Field label="Clinical Notes">
              <Textarea value={form.notes} placeholder="Summary of findings…" onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </Field>
            <Field label="Attach File">
              <label style={{ display: 'block', cursor: 'pointer' }}>
                <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.dcm,.txt" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <div style={{ padding: '0.55rem 0.875rem', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: '0.875rem', cursor: 'pointer' }}>
                  {file ? `✅ ${file.name} (${(file.size/1024).toFixed(1)} KB)` : '📎 Click to attach PDF, image…'}
                </div>
              </label>
            </Field>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button loading={uploading} onClick={handleUpload}>
                📤 Upload to Patient Registry
              </Button>
              <Button variant="outline" onClick={() => { setStep('connect'); setIsDelegate(false); setPatientContract(''); setPatientAesKey(null) }}>
                Change Patient
              </Button>
            </div>
          </div>

          {/* Uploaded records this session */}
          {uploadedRecords.length > 0 && (
            <div style={S.card}>
              <h4 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                Uploaded This Session ({uploadedRecords.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {uploadedRecords.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.875rem', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border)', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{r.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.type}</div>
                    </div>
                    <a href={`${EXPLORER}/tx/${r.txHash}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none' }}>
                      View Tx ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}