import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import type { useRegistry } from '@/hooks/useRegistry'
import type { HealthRecord, AccessGrant } from '@/lib/types'
import { targetChain } from '@/lib/wagmi'
import { useIsMobile } from '@/hooks/useIsMobile'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'
type Tab = 'records' | 'access' | 'txns' | 'audit'

const RECORD_TYPES = ['Lab Results','Prescription','Medical Imaging','Doctor Visit','Vaccine Record','Surgery Report','Mental Health Note','Other'] as const
const ROLES = ['Doctor','Insurer','Researcher','Emergency','Pharmacist']

const S = {
  card:      { background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties,
  infoTeal:  { background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)', color: 'var(--text2)', fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, lineHeight: 1.6, marginBottom: '1rem' } as React.CSSProperties,
  infoAmber: { background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.22)', color: '#ffd080', fontSize: '0.82rem', padding: '0.65rem 0.9rem', borderRadius: 8, lineHeight: 1.6, marginBottom: '1rem' } as React.CSSProperties,
}

const BADGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'Lab Results':     { bg: 'rgba(0,229,204,0.1)',   color: 'var(--teal)',   border: 'rgba(0,229,204,0.2)' },
  'Prescription':    { bg: 'rgba(0,230,118,0.1)',   color: 'var(--green)',  border: 'rgba(0,230,118,0.2)' },
  'Medical Imaging': { bg: 'rgba(0,82,255,0.12)',   color: '#6699ff',       border: 'rgba(0,82,255,0.25)' },
  'Doctor Visit':    { bg: 'rgba(255,179,0,0.1)',   color: 'var(--amber)',  border: 'rgba(255,179,0,0.2)' },
  'Vaccine Record':  { bg: 'rgba(255,100,200,0.1)', color: '#ff80d5',       border: 'rgba(255,100,200,0.2)' },
}

function RecordBadge({ type }: { type: string }) {
  const c = BADGE_COLORS[type] ?? { bg: 'rgba(200,200,200,0.08)', color: 'var(--text2)', border: 'var(--border)' }
  return <span style={{ fontSize: '0.67rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em', background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{type}</span>
}

function Empty({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 2rem', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{icon}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.4rem' }}>{title}</div>
      <div style={{ fontSize: '0.82rem' }}>{desc}</div>
    </div>
  )
}

interface Props {
  encKey: CryptoKey | null
  encSig?: string | null
  encError: string | null
  reg: ReturnType<typeof useRegistry>
}

export function Dashboard({ encKey, encSig, encError, reg }: Props) {
  const { address } = useAccount()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('records')

  const [uploadOpen, setUploadOpen]     = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadForm, setUploadForm]     = useState({ type: '' as typeof RECORD_TYPES[number] | '', title: '', provider: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const [uploadFile, setUploadFile]     = useState<File | null>(null)

  const [grantOpen, setGrantOpen]       = useState(false)
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantForm, setGrantForm]       = useState({ name: '', address: '', role: '', expiry: '', purpose: '', granteeSig: '' })
  const [selectedRecords, setSelectedRecords] = useState<string[]>([])

  const [viewRecord, setViewRecord]     = useState<HealthRecord | null>(null)
  const [viewNotes, setViewNotes]       = useState('')

  const isMobile = useIsMobile()

  const openView = async (r: HealthRecord) => {
    setViewRecord(r)
    setViewNotes(await reg.decryptRecord(r))
  }

  const handleUpload = async () => {
    if (!uploadForm.type || !uploadForm.title || !uploadForm.date) { toast('warn', 'Fill in Type, Title, and Date.'); return }
    setUploadLoading(true)
    try {
      await reg.uploadRecord({ type: uploadForm.type as typeof RECORD_TYPES[number], title: uploadForm.title, provider: uploadForm.provider, date: uploadForm.date, notes: uploadForm.notes, file: uploadFile ?? undefined })
      toast('ok', `"${uploadForm.title}" encrypted and anchored!`)
      setUploadOpen(false)
      setUploadForm({ type: '', title: '', provider: '', date: new Date().toISOString().split('T')[0], notes: '' })
      setUploadFile(null)
    } catch (e: unknown) { toast('err', e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploadLoading(false) }
  }

  const handleGrant = async () => {
    if (!grantForm.name || !grantForm.address || !grantForm.role) { toast('warn', 'Name, address, and role are required.'); return }
    if (!/^0x[0-9a-fA-F]{40}$/.test(grantForm.address)) { toast('warn', 'Invalid Ethereum address.'); return }
    if (selectedRecords.length === 0) { toast('warn', 'Select at least one record.'); return }
    if (!grantForm.granteeSig) { toast('warn', 'Grantee signature is required so the decryption key can be shared with them.'); return }
    setGrantLoading(true)
    try {
      const titles = selectedRecords.map(id => reg.records.find(r => r.id === id)?.title ?? id)
      await reg.grantAccess({ name: grantForm.name, granteeAddress: grantForm.address as Address, role: grantForm.role, purpose: grantForm.purpose, recordIds: selectedRecords as `0x${string}`[], titles, expiry: grantForm.expiry || null, granteeSig: grantForm.granteeSig })
      toast('ok', `Access granted to ${grantForm.name}!`)
      setGrantOpen(false)
      setGrantForm({ name: '', address: '', role: '', expiry: '', purpose: '', granteeSig: '' })
      setSelectedRecords([])
    } catch (e: unknown) { toast('err', e instanceof Error ? e.message : 'Grant failed') }
    finally { setGrantLoading(false) }
  }

  const handleRevoke = async (g: AccessGrant) => {
    if (!window.confirm(`Revoke access for ${g.name}?`)) return
    try { await reg.revokeAccess(g.grantId); toast('ok', `Access revoked for ${g.name}.`) }
    catch (e: unknown) { toast('err', e instanceof Error ? e.message : 'Revoke failed') }
  }

  const handleRemove = async (r: HealthRecord) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return
    try { await reg.removeRecord(r.id); toast('ok', 'Record removed.') }
    catch (e: unknown) { toast('err', e instanceof Error ? e.message : 'Remove failed') }
  }

  const exportAudit = () => {
    const rows = ['Timestamp,OnChain,TxHash,Message', ...reg.auditLog.map(e => `"${new Date(e.ts).toISOString()}","${e.onChain}","${e.txHash ?? ''}","${e.msg.replace(/"/g, "'")}"` )]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    a.download = 'medvault-audit.csv'
    a.click()
    toast('ok', 'Exported.')
  }

  const short = (addr: string) => `${addr.slice(0,6)}…${addr.slice(-4)}`
  const TABS: { id: Tab; label: string }[] = [
    { id: 'records', label: '📁 Records' },
    { id: 'access',  label: '🔑 Access Control' },
    { id: 'txns',    label: '⛓ Transactions' },
    { id: 'audit',   label: '🕵️ Audit Log' },
  ]

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: isMobile ? 'flex-start' : 'space-between',
flexDirection: isMobile ? 'column' as const : 'row' as const, gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Health Records</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>{address} · {targetChain.name}</p>
        </div>
        {reg.contractAddress && (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    <a href={`${EXPLORER}/address/${reg.contractAddress}`} target="_blank" rel="noreferrer"
      style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', padding: '0.4rem 0.85rem', borderRadius: 9, background: 'var(--s1)', border: '1px solid var(--border)', color: 'var(--teal)', textDecoration: 'none' }}>
      Registry: {short(reg.contractAddress)} ↗
    </a>
    <button
      onClick={() => navigator.clipboard.writeText(reg.contractAddress!).then(() => toast('ok', 'Contract address copied!'))}
      style={{ fontSize: '0.72rem', padding: '0.4rem 0.85rem', borderRadius: 9, background: 'var(--s1)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)' }}
    >
      📋 Copy for Grantee
    </button>
  </div>
)}
      </div>

      {encError && <div style={{ ...S.infoAmber, marginBottom: '1.25rem' }}>⚠ {encError}</div>}
      {!encKey && !encError && <div style={{ ...S.infoTeal, marginBottom: '1.25rem' }}>🔑 Waiting for encryption key signature…</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.875rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Records',       value: reg.records.length, color: 'var(--teal)',  sub: 'encrypted on-chain' },
          { label: 'Active Grants', value: reg.grants.length,  color: 'var(--green)', sub: 'live permissions' },
          { label: 'Transactions',  value: reg.txLog.length,   color: 'var(--amber)', sub: 'Base txns' },
          { label: 'Encryption',    value: encKey ? '✓ Active' : '✗ Pending', color: encKey ? 'var(--green)' : 'var(--red)', sub: 'AES-256-GCM' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, padding: '1.1rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.color }} />
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: '0.4rem' }}>{s.label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font)', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '0.25rem' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.2rem', width: isMobile ? '100%' : 'fit-content',
overflowX: 'auto' as const, marginBottom: '1.25rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 500, padding: '0.42rem 0.9rem', borderRadius: 7, cursor: 'pointer', background: tab === t.id ? 'var(--s3)' : 'transparent', color: tab === t.id ? 'var(--text)' : 'var(--text3)', border: tab === t.id ? '1px solid var(--border2)' : '1px solid transparent', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* RECORDS */}
      {tab === 'records' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Encrypted Health Records</h3>
            <Button size="sm" onClick={() => setUploadOpen(true)}>+ Upload Record</Button>
          </div>
          {reg.records.length === 0
            ? <Empty icon="🗂" title="No records yet" desc="Upload your first health record to encrypt and anchor on Base." />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.9rem' }}>
                {reg.records.map((r, i) => (
                  <div key={r.id} style={{ ...S.card, padding: '1.1rem', animation: `fadeUp 0.22s ease ${i * 0.04}s both` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <RecordBadge type={r.type} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text3)' }}>{r.id.slice(0,10)}…</span>
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>{r.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '0.25rem' }}>🏥 {r.provider}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.75rem' }}>📅 {r.date}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--green)' }}>🔒 AES-256-GCM</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>👁 {r.accessCount} grant{r.accessCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <Button variant="outline" size="sm" onClick={() => openView(r)}>View</Button>
                      <Button variant="success" size="sm" onClick={() => { setGrantOpen(true); setSelectedRecords([r.id]) }}>Share</Button>
                      <Button variant="danger"  size="sm" onClick={() => handleRemove(r)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* ACCESS */}
      {tab === 'access' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Access Grants</h3>
            <Button size="sm" onClick={() => setGrantOpen(true)}>+ Grant Access</Button>
          </div>
          <div style={S.infoTeal}>
            📜 Each grant/revoke calls <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>grantAccess()</code> / <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>revokeAccess()</code> on your registry on {targetChain.name}.
          </div>
          {reg.grants.length === 0
            ? <Empty icon="🔒" title="No access granted" desc="Your records are private. Grant selective access to doctors, insurers, or researchers." />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {reg.grants.map((g, i) => (
                  <div key={g.grantId} style={{ ...S.card, padding: '0.9rem 1.1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', animation: `fadeUp 0.2s ease ${i * 0.04}s both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(0,229,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                        {({ Doctor:'🩺', Insurer:'🏦', Researcher:'🔬', Emergency:'🚨', Pharmacist:'💊' } as Record<string,string>)[g.role] ?? '👤'}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{g.name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text3)' }}>{short(g.address)} · {g.role} · Grant #{g.grantId}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {g.titles.map(t => <span key={t} style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem', borderRadius: 4, background: 'var(--s3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>{t}</span>)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {g.expiry && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text3)' }}>exp: {g.expiry}</span>}
                      <a href={`${EXPLORER}/tx/${g.txHash}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Tx ↗</Button></a>
                      <Button variant="danger" size="sm" onClick={() => handleRevoke(g)}>Revoke</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* TRANSACTIONS */}
      {tab === 'txns' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>On-Chain Transactions</h3>
            {reg.contractAddress && (
              <a href={`${EXPLORER}/address/${reg.contractAddress}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">BaseScan ↗</Button>
              </a>
            )}
          </div>
          {reg.txLog.length === 0
            ? <Empty icon="⛓" title="No transactions yet" desc="Upload a record or grant access to create on-chain transactions." />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {reg.txLog.map((tx, i) => {
                  const icons: Record<string,string> = { deploy:'🚀', upload:'📄', grant:'🔑', revoke:'🚫', remove:'🗑' }
                  return (
                    <div key={i} style={{ ...S.card, padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.7rem', animation: `fadeUp 0.18s ease ${i*0.03}s both` }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(0,229,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>{icons[tx.type] ?? '📄'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>{tx.label} — {tx.detail}</div>
                        <a href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--mono)', fontSize: '0.67rem', color: 'var(--teal)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{tx.hash}</a>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.67rem', color: 'var(--text3)' }}>{new Date(tx.ts).toLocaleTimeString()}</div>
                        <span style={{ fontSize: '0.67rem', padding: '0.12rem 0.4rem', borderRadius: 4, background: 'rgba(0,230,118,0.1)', color: 'var(--green)', marginTop: 2, display: 'inline-block' }}>✓ confirmed</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      )}

      {/* AUDIT */}
      {tab === 'audit' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Immutable Audit Log</h3>
            <Button variant="outline" size="sm" onClick={exportAudit}>Export CSV</Button>
          </div>
          <div style={S.infoAmber}>⚠ Entries marked [chain] correspond to real {targetChain.name} transactions.</div>
          {reg.auditLog.length === 0
            ? <Empty icon="📋" title="Audit log is empty" desc="All on-chain events will appear here." />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {reg.auditLog.map((e, i) => {
                  const dotColor = { teal: 'var(--teal)', green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)' }[e.color]
                  return (
                    <div key={i} style={{ ...S.card, padding: '0.65rem 0.875rem', display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.8rem', animation: `fadeUp 0.15s ease ${i*0.02}s both` }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, color: 'var(--text2)', lineHeight: 1.55, wordBreak: 'break-all' }}>
                        {e.msg}
                        {e.txHash && <a href={`${EXPLORER}/tx/${e.txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--teal)', textDecoration: 'none' }}>[chain ↗]</a>}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text3)', flexShrink: 0 }}>{new Date(e.ts).toLocaleTimeString()}</div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      )}

      {/* UPLOAD MODAL */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="📄 Upload Health Record">
        <div style={S.infoTeal}>🔐 Encrypted in-browser with AES-256-GCM. Only the IPFS CID + hash go on-chain.</div>
        <Field label="Record Type" required>
          <Select value={uploadForm.type} onChange={e => setUploadForm(p => ({ ...p, type: e.target.value as typeof RECORD_TYPES[number] }))}>
            <option value="">Select…</option>
            {RECORD_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
          <Field label="Title" required>
            <Input value={uploadForm.title} placeholder="e.g. Blood Panel Q4" onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))} />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={uploadForm.date} onChange={e => setUploadForm(p => ({ ...p, date: e.target.value }))} />
          </Field>
        </div>
        <Field label="Healthcare Provider">
          <Input value={uploadForm.provider} placeholder="e.g. Dr. Sarah Chen" onChange={e => setUploadForm(p => ({ ...p, provider: e.target.value }))} />
        </Field>
        <Field label="Clinical Notes">
          <Textarea value={uploadForm.notes} placeholder="Optional summary…" onChange={e => setUploadForm(p => ({ ...p, notes: e.target.value }))} />
        </Field>
        <Field label="Attach File">
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.dcm,.txt" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
            <div style={{ padding: '0.55rem 0.875rem', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: '0.875rem', cursor: 'pointer' }}>
              {uploadFile ? `✅ ${uploadFile.name} (${(uploadFile.size/1024).toFixed(1)} KB)` : '📎 Click to attach PDF, DICOM, image…'}
            </div>
          </label>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
          <Button loading={uploadLoading} onClick={handleUpload}>🔐 Encrypt & Anchor on Base</Button>
        </div>
      </Modal>

      {/* GRANT MODAL */}
      <Modal open={grantOpen} onClose={() => setGrantOpen(false)} title="🔑 Grant Record Access">
        <div style={S.infoTeal}>
          📜 Calls <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>grantAccess(address, bytes32[], expiry)</code> on {targetChain.name}. The grantee's decryption key is also encrypted and stored.
        </div>
        <Field label="Recipient Name" required>
          <Input value={grantForm.name} placeholder="e.g. Dr. Marcus Lee" onChange={e => setGrantForm(p => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Wallet Address (0x…)" required>
          <Input value={grantForm.address} placeholder="0x…" style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }} onChange={e => setGrantForm(p => ({ ...p, address: e.target.value }))} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="Role" required>
            <Select value={grantForm.role} onChange={e => setGrantForm(p => ({ ...p, role: e.target.value }))}>
              <option value="">Select…</option>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Expires (optional)">
            <Input type="date" value={grantForm.expiry} onChange={e => setGrantForm(p => ({ ...p, expiry: e.target.value }))} />
          </Field>
        </div>
        <Field label="Records to Share" required>
          {reg.records.length === 0
            ? <p style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>No records uploaded yet.</p>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {reg.records.map(r => {
                  const checked = selectedRecords.includes(r.id)
                  return (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', padding: '0.3rem 0.65rem', borderRadius: 7, background: checked ? 'rgba(0,229,204,0.08)' : 'var(--bg)', border: `1px solid ${checked ? 'var(--teal)' : 'var(--border2)'}`, color: checked ? 'var(--teal)' : 'var(--text2)', transition: 'all 0.15s' }}>
                      <input type="checkbox" checked={checked} style={{ accentColor: 'var(--teal)' }} onChange={e => setSelectedRecords(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />
                      {r.type}: {r.title}
                    </label>
                  )
                })}
              </div>
            )}
        </Field>
        <Field label="Purpose / Notes">
          <Textarea value={grantForm.purpose} placeholder="e.g. Cardiology referral…" style={{ minHeight: 55 }} onChange={e => setGrantForm(p => ({ ...p, purpose: e.target.value }))} />
        </Field>
        <Field label="Grantee Signature" required hint="The grantee opens MedVault, selects 'I'm a Grantee', clicks 'Sign to Unlock', then copies and sends you the signature shown on screen.">
          <Textarea value={grantForm.granteeSig} placeholder="0x… (paste signature from grantee)" style={{ minHeight: 55, fontFamily: 'var(--mono)', fontSize: '0.72rem' }} onChange={e => setGrantForm(p => ({ ...p, granteeSig: e.target.value }))} />
        </Field>
        <div style={{ ...S.infoAmber, marginBottom: 0 }}>
          ⚠ Without the grantee's signature, they can verify access on-chain but cannot decrypt the record content.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
          <Button 
  variant="success" 
  loading={grantLoading} 
  onClick={handleGrant}
  disabled={!encKey}
>
  {encKey ? '📜 Sign & Grant on Base' : '🔑 Waiting for encryption key…'}
</Button>
        </div>
      </Modal>

      {/* VIEW MODAL */}
      <Modal open={!!viewRecord} onClose={() => setViewRecord(null)} title="🔍 Record Details" maxWidth={540}>
        {viewRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <RecordBadge type={viewRecord.type} />
              <span style={{ fontSize: '0.72rem', color: 'var(--green)' }}>🔒 AES-256-GCM encrypted</span>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>Title</div>
              <div style={{ fontWeight: 600 }}>{viewRecord.title}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>Provider</div>
                <div style={{ fontSize: '0.875rem' }}>{viewRecord.provider}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>Date</div>
                <div style={{ fontSize: '0.875rem' }}>{viewRecord.date}</div>
              </div>
            </div>
            {viewNotes && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>Notes (decrypted)</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.6 }}>{viewNotes}</div>
              </div>
            )}
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>Content Hash</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text3)', wordBreak: 'break-all' }}>{viewRecord.id}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>IPFS CID</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text3)', wordBreak: 'break-all' }}>{viewRecord.ipfsCid}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a href={`${EXPLORER}/tx/${viewRecord.txHash}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">View Tx ↗</Button>
              </a>
              {reg.contractAddress && (
                <a href={`${EXPLORER}/address/${reg.contractAddress}`} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">Registry ↗</Button>
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}