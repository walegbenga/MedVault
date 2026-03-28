import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address, createPublicClient, http } from 'viem'
import { keccak256, toUtf8Bytes } from 'ethers'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useEncryptionKey } from '@/hooks/useEncryptionKey'
import { CONTRACT_ABI } from '@/lib/contract'
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
  const { address }            = useAccount()
  const publicClient           = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { toast }              = useToast()
  const { encKey, loading: keyLoading, derive } = useEncryptionKey()

  const [patientContract,  setPatientContract]  = useState('')
  const [isDelegate,       setIsDelegate]       = useState(false)
  const [checking,         setChecking]         = useState(false)
  const [uploading,        setUploading]        = useState(false)
  const [uploadedRecords,  setUploadedRecords]  = useState<UploadedRecord[]>([])
  const [step,             setStep]             = useState<'connect' | 'upload' | 'done'>('connect')

  const [form, setForm] = useState({
    type:     '' as RecordType | '',
    title:    '',
    provider: '',
    date:     new Date().toISOString().split('T')[0],
    notes:    '',
  })
  const [file, setFile] = useState<File | null>(null)

  const handleCheck = async () => {
    if (!address || !publicClient) return
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
      const isDel = await contract.read.delegates([address]) as boolean
      if (!isDel) {
        toast('err', 'Your wallet is not a delegate for this registry.')
        setIsDelegate(false)
        return
      }
      setIsDelegate(true)
      setStep('upload')
      toast('ok', 'Delegate access confirmed!')
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
    if (!encKey) {
      toast('warn', 'Encryption key not ready. Please sign the message first.')
      await derive()
      return
    }

    setUploading(true)
    try {
      // Build payload
      const metadata = { ...form, wallet: address, uploadedBy: 'delegate', ts: Date.now() }
      let payload: string

      const { encrypt } = await import('@/lib/crypto')
      const encrypted = await encrypt(JSON.stringify(metadata), encKey)
      payload = JSON.stringify({ enc: encrypted.ciphertext, iv: encrypted.iv })

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
        id:      contentHash,
        title:   form.title,
        type:    form.type,
        txHash:  hash,
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
    card: { background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 14, padding: '1.75rem' } as React.CSSProperties,
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
          You must be an approved delegate.
        </p>
      </div>

      {/* Step 1 — Enter contract */}
      {step === 'connect' && (
        <div style={S.card}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
            Step 1: Enter the patient's contract address
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            The patient must have added your wallet as a delegate from their dashboard first.
          </p>
          <div style={S.infoTeal}>
            🩺 Delegates can upload and update records but cannot grant or revoke access.
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

      {/* Step 2 — Upload */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Confirmation banner */}
          <div style={{
            padding: '0.875rem 1rem', borderRadius: 10,
            background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.2)',
            display: 'flex', alignItems: 'center', gap: '0.65rem',
          }}>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--green)' }}>
                Delegate access confirmed
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)' }}>
                {patientContract}
              </div>
            </div>
          </div>

          {/* Encryption key status */}
          {!encKey && (
            <div style={{
              padding: '0.875rem 1rem', borderRadius: 10,
              background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '0.75rem', flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--amber)' }}>
                  🔑 Encryption key required
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
                  Sign a message to derive your encryption key before uploading.
                </div>
              </div>
              <Button size="sm" loading={keyLoading} onClick={derive}>
                ✍️ Sign to Unlock
              </Button>
            </div>
          )}

          {/* Upload form */}
          <div style={S.card}>
            <h3 style={{ fontWeight: 700, marginBottom: '1rem' }}>Upload Record</h3>
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
              <Button loading={uploading} onClick={handleUpload} disabled={!encKey}>
                📤 Upload to Patient Registry
              </Button>
              <Button variant="outline" onClick={() => { setStep('connect'); setIsDelegate(false); setPatientContract('') }}>
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
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.6rem 0.875rem', borderRadius: 8,
                    background: 'var(--s2)', border: '1px solid var(--border)',
                    gap: '0.5rem', flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{r.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.type}</div>
                    </div>
                    
                      <a href={`${EXPLORER}/tx/${r.txHash}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none' }}
                    >
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