import React, { useState, useMemo } from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useEnsResolver } from '@/hooks/useEns'
import { useGasEstimate } from '@/hooks/useGasEstimate'
import { useNotifications } from '@/hooks/useNotifications'
import { GasEstimateTag } from '@/components/ui/GasEstimateTag'
import { FileViewer } from '@/components/FileViewer'
import { EmergencyAccess } from '@/components/EmergencyAccess'
import { DelegateManager } from '@/components/DelegateManager'
import { NotificationBell } from '@/components/NotificationBell'
import { QRGrantee } from '@/components/QRGrantee'
import type { useRegistry } from '@/hooks/useRegistry'
import type { HealthRecord, AccessGrant, RecordType } from '@/lib/types'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'
type Tab = 'records' | 'access' | 'emergency' | 'delegates' | 'txns' | 'audit'

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
  return (
    <span style={{ fontSize: '0.67rem', fontWeight: 700, padding: '0.18rem 0.6rem', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em', background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {type}
    </span>
  )
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
  const { toast }   = useToast()
  const isMobile    = useIsMobile()
  const ens         = useEnsResolver()
  const gas         = useGasEstimate(reg.contractAddress)
  const notif       = useNotifications(address, reg.contractAddress)

  const [tab, setTab] = useState<Tab>('records')

  // Search + filter
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [sortBy,     setSortBy]     = useState<'newest' | 'oldest' | 'title'>('newest')

  // Upload
  const [uploadOpen,    setUploadOpen]    = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadForm,    setUploadForm]    = useState({ type: '' as RecordType | '', title: '', provider: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const [uploadFile,    setUploadFile]    = useState<File | null>(null)

  // Update
  const [updateOpen,    setUpdateOpen]    = useState(false)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [updateTarget,  setUpdateTarget]  = useState<HealthRecord | null>(null)
  const [updateForm,    setUpdateForm]    = useState({ type: '' as RecordType | '', title: '', provider: '', date: '', notes: '' })
  const [updateFile,    setUpdateFile]    = useState<File | null>(null)

  // Grant
  const [grantOpen,       setGrantOpen]       = useState(false)
  const [grantLoading,    setGrantLoading]     = useState(false)
  const [grantForm,       setGrantForm]        = useState({ name: '', address: '', role: '', expiry: '', purpose: '', granteeSig: '' })
  const [selectedRecords, setSelectedRecords]  = useState<string[]>([])

  // View
  const [viewRecord,     setViewRecord]     = useState<HealthRecord | null>(null)
  const [viewNotes,      setViewNotes]      = useState('')
  const [viewFile,       setViewFile]       = useState<{ name: string; size: number; data: string } | null>(null)
  const [fileViewerOpen, setFileViewerOpen] = useState(false)

  // Add this state at the top of Dashboard
const [lastSync, setLastSync] = useState<number | null>(null)
const [syncing,  setSyncing]  = useState(false)

  // Filtered records
  const filteredRecords = useMemo(() => {
    let result = [...reg.records]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.title.toLowerCase().includes(q)    ||
        r.type.toLowerCase().includes(q)     ||
        r.provider.toLowerCase().includes(q) ||
        r.date.includes(q)
      )
    }
    if (filterType !== 'all') result = result.filter(r => r.type === filterType)
    result.sort((a, b) => {
      if (sortBy === 'newest') return b.ts - a.ts
      if (sortBy === 'oldest') return a.ts - b.ts
      if (sortBy === 'title')  return a.title.localeCompare(b.title)
      return 0
    })
    return result
  }, [reg.records, search, filterType, sortBy])

  const openView = async (r: HealthRecord) => {
    setViewRecord(r)
    setViewNotes(await reg.decryptRecord(r))
    try {
      const { fetchBlob } = await import('@/lib/ipfs')
      const raw = await fetchBlob(r.ipfsCid)
      if (raw) {
        const blob = JSON.parse(raw)
        setViewFile(blob.file ?? null)
      }
    } catch { setViewFile(null) }
  }

  const openUpdate = (r: HealthRecord) => {
    setUpdateTarget(r)
    setUpdateForm({ type: r.type, title: r.title, provider: r.provider, date: r.date, notes: r.notes })
    setUpdateOpen(true)
  }

  const handleUpload = async () => {
    if (!uploadForm.type || !uploadForm.title || !uploadForm.date) {
      toast('warn', 'Fill in Type, Title, and Date.')
      return
    }
    setUploadLoading(true)
    try {
      await reg.uploadRecord({
        type: uploadForm.type as RecordType,
        title: uploadForm.title,
        provider: uploadForm.provider,
        date: uploadForm.date,
        notes: uploadForm.notes,
        file: uploadFile ?? undefined,
      })
      toast('ok', `"${uploadForm.title}" encrypted and anchored!`)
      setUploadOpen(false)
      setUploadForm({ type: '', title: '', provider: '', date: new Date().toISOString().split('T')[0], notes: '' })
      setUploadFile(null)
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploadLoading(false) }
  }

  const handleUpdate = async () => {
    if (!updateTarget) return
    if (!updateForm.type || !updateForm.title || !updateForm.date) {
      toast('warn', 'Fill in Type, Title, and Date.')
      return
    }
    setUpdateLoading(true)
    try {
      await reg.updateRecord(updateTarget, {
        type: updateForm.type as RecordType,
        title: updateForm.title,
        provider: updateForm.provider,
        date: updateForm.date,
        notes: updateForm.notes,
        file: updateFile ?? undefined,
      })
      toast('ok', `"${updateForm.title}" updated to v${updateTarget.version + 1}!`)
      setUpdateOpen(false)
      setUpdateTarget(null)
      setUpdateFile(null)
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Update failed')
    } finally { setUpdateLoading(false) }
  }

  const handleGrant = async () => {
    if (!grantForm.name || !grantForm.address || !grantForm.role) {
      toast('warn', 'Name, address, and role are required.')
      return
    }
    let finalAddress = grantForm.address.trim()
    if (!(/^0x[0-9a-fA-F]{40}$/.test(finalAddress))) {
      const resolved = await ens.resolve(finalAddress)
      if (!resolved) { toast('warn', 'Invalid address or ENS name could not be resolved.'); return }
      finalAddress = resolved
    }
    if (selectedRecords.length === 0) { toast('warn', 'Select at least one record.'); return }
    if (!grantForm.granteeSig) { toast('warn', 'Grantee signature is required.'); return }

    setGrantLoading(true)
    try {
      const titles = selectedRecords.map(id => reg.records.find(r => r.id === id)?.title ?? id)
      await reg.grantAccess({
        name: grantForm.name,
        granteeAddress: finalAddress as Address,
        role: grantForm.role,
        purpose: grantForm.purpose,
        recordIds: selectedRecords as `0x${string}`[],
        titles,
        expiry: grantForm.expiry || null,
        granteeSig: grantForm.granteeSig,
      })
      toast('ok', `Access granted to ${grantForm.name}!`)
      setGrantOpen(false)
      setGrantForm({ name: '', address: '', role: '', expiry: '', purpose: '', granteeSig: '' })
      setSelectedRecords([])
      ens.reset()
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Grant failed')
    } finally { setGrantLoading(false) }
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
    const rows = [
      'Timestamp,OnChain,TxHash,Message',
      ...reg.auditLog.map(e =>
        `"${new Date(e.ts).toISOString()}","${e.onChain}","${e.txHash ?? ''}","${e.msg.replace(/"/g, "'")}"`
      )
    ]
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    a.download = 'verihealth-audit.csv'
    a.click()
    toast('ok', 'Exported.')
  }

  const short = (addr: string) => `${addr.slice(0,6)}…${addr.slice(-4)}`

  const TABS: { id: Tab; label: string }[] = [
    { id: 'records',   label: '📁 Records' },
    { id: 'access',    label: '🔑 Access' },
    { id: 'emergency', label: '🚨 Emergency' },
    { id: 'delegates', label: '🩺 Delegates' },
    { id: 'txns',      label: '⛓ Transactions' },
    { id: 'audit',     label: '🕵️ Audit' },
  ]

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start',
        justifyContent: isMobile ? 'flex-start' : 'space-between',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '1rem', marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Health Records
          </h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
            {address} · {targetChain.name}
          </p>
        </div>

        {reg.contractAddress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <NotificationBell
              notifications={notif.notifications}
              unreadCount={notif.unreadCount}
              permission={notif.permission}
              onRequestPermission={notif.requestPermission}
              onMarkRead={notif.markRead}
              onMarkAllRead={notif.markAllRead}
              onClearAll={notif.clearAll}
            />
            
              <a href={`${EXPLORER}/address/${reg.contractAddress}`}
              target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', padding: '0.4rem 0.85rem', borderRadius: 9, background: 'var(--s1)', border: '1px solid var(--border)', color: 'var(--teal)', textDecoration: 'none' }}
            >
              Registry: {short(reg.contractAddress)} ↗
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(reg.contractAddress!).then(() => toast('ok', 'Contract address copied!'))}
              style={{ fontSize: '0.72rem', padding: '0.4rem 0.85rem', borderRadius: 9, background: 'var(--s1)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              📋 Copy for Grantee
            </button>
            <QRGrantee mode="show" contractAddress={reg.contractAddress ?? ''} />
<button
  onClick={async () => {
    setSyncing(true)
    try {
      await reg.refreshFromChain()
      setLastSync(Date.now())
      toast('ok', 'Records synced!')
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }}
  style={{
    fontSize: '0.72rem', padding: '0.4rem 0.85rem', borderRadius: 9,
    background: 'var(--s1)', border: '1px solid var(--border)',
    color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)',
    display: 'flex', alignItems: 'center', gap: '0.4rem',
  }}
>
  <span style={{
    display: 'inline-block',
    animation: syncing ? 'spin 0.7s linear infinite' : 'none',
  }}>🔄</span>
  {syncing ? 'Syncing…' : lastSync ? `Synced ${Math.floor((Date.now() - lastSync) / 1000)}s ago` : 'Sync'}
</button>
          </div>
        )}
      </div>

      {encError && <div style={{ ...S.infoAmber, marginBottom: '1.25rem' }}>⚠ {encError}</div>}
      {!encKey && !encError && <div style={{ ...S.infoTeal, marginBottom: '1.25rem' }}>🔑 Waiting for encryption key signature…</div>}

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.875rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Records',       value: reg.records.length,  color: 'var(--teal)',  sub: 'encrypted on-chain' },
          { label: 'Active Grants', value: reg.grants.length,   color: 'var(--green)', sub: 'live permissions' },
          { label: 'Transactions',  value: reg.txLog.length,    color: 'var(--amber)', sub: 'Base txns' },
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

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.2rem', width: isMobile ? '100%' : 'fit-content', overflowX: 'auto', marginBottom: '1.25rem' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 500, padding: '0.42rem 0.9rem', borderRadius: 7, cursor: 'pointer', background: tab === t.id ? 'var(--s3)' : 'transparent', color: tab === t.id ? 'var(--text)' : 'var(--text3)', border: tab === t.id ? '1px solid var(--border2)' : '1px solid transparent', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── RECORDS TAB ── */}
      {tab === 'records' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ fontWeight: 700 }}>Encrypted Health Records</h3>
            <Button size="sm" onClick={() => setUploadOpen(true)}>+ Upload Record</Button>
          </div>

          {reg.records.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '1.25rem' }}>
              <div style={{ flex: '1 1 200px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search records…"
                  style={{ width: '100%', paddingLeft: '2.2rem', paddingRight: '0.875rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', borderRadius: 8, fontSize: '0.875rem', background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--font)', boxSizing: 'border-box' as const }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.85rem', padding: 0, minHeight: 'unset', minWidth: 'unset' }}>✕</button>
                )}
              </div>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '0.5rem 0.875rem', borderRadius: 8, fontSize: '0.82rem', background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--font)', cursor: 'pointer' }}>
                <option value="all">All Types</option>
                {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ padding: '0.5rem 0.875rem', borderRadius: 8, fontSize: '0.82rem', background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--font)', cursor: 'pointer' }}>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">A → Z</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text3)', padding: '0.5rem 0.875rem', borderRadius: 8, background: 'var(--s1)', border: '1px solid var(--border)' }}>
                {filteredRecords.length} of {reg.records.length} record{reg.records.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {reg.records.length === 0 ? (
            <Empty icon="🗂" title="No records yet" desc="Upload your first health record to encrypt and anchor on Base." />
          ) : filteredRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.4rem' }}>No records match</div>
              <div style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>Try a different search term or filter.</div>
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilterType('all') }}>Clear Filters</Button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.9rem' }}>
              {filteredRecords.map((r, i) => (
                <div key={r.id} style={{ ...S.card, padding: '1.1rem', animation: `fadeUp 0.22s ease ${i * 0.04}s both` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <RecordBadge type={r.type} />
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      {r.version > 1 && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 4, background: 'rgba(0,82,255,0.1)', color: '#6699ff', border: '1px solid rgba(0,82,255,0.2)' }}>v{r.version}</span>
                      )}
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text3)' }}>{r.id.slice(0,10)}…</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>{r.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '0.25rem' }}>🏥 {r.provider}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.5rem' }}>📅 {r.date}</div>
                  {r.hasFile && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      📎 Has attachment
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--green)' }}>🔒 AES-256-GCM</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>👁 {r.accessCount} grant{r.accessCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <Button variant="outline" size="sm" onClick={() => openView(r)}>View</Button>
                    <Button variant="outline" size="sm" onClick={() => openUpdate(r)}>Edit</Button>
                    <Button variant="success" size="sm" onClick={() => { setGrantOpen(true); setSelectedRecords([r.id]) }}>Share</Button>
                    <Button variant="danger"  size="sm" onClick={() => handleRemove(r)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ACCESS TAB ── */}
      {tab === 'access' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Access Grants</h3>
            <Button size="sm" onClick={() => setGrantOpen(true)}>+ Grant Access</Button>
          </div>
          <div style={S.infoTeal}>
            📜 Each grant/revoke calls <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>grantAccess()</code> / <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>revokeAccess()</code> on your registry on {targetChain.name}.
          </div>
          {reg.grants.length === 0 ? (
            <Empty icon="🔒" title="No access granted" desc="Your records are private. Grant selective access to doctors, insurers, or researchers." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {reg.grants.map((g, i) => (
                <div key={g.grantId} style={{ ...S.card, padding: '0.9rem 1.1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', animation: `fadeUp 0.2s ease ${i * 0.04}s both` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(0,229,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                      {({ Doctor:'🩺', Insurer:'🏦', Researcher:'🔬', Emergency:'🚨', Pharmacist:'💊' } as Record<string,string>)[g.role] ?? '👤'}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text3)' }}>
                        {short(g.address)} · {g.role} · Grant #{g.grantId}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {g.titles.map(t => (
                      <span key={t} style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem', borderRadius: 4, background: 'var(--s3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>{t}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {g.expiry && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text3)' }}>exp: {g.expiry}</span>}
                    <a href={`${EXPLORER}/tx/${g.txHash}`} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">Tx ↗</Button>
                    </a>
                    <Button
                      variant="danger" size="sm"
                      onMouseEnter={() => gas.estimateRevoke(g.grantId)}
                      onClick={() => handleRevoke(g)}
                    >
                      Revoke {gas.estimates.revoke?.costUsd ? `(~${gas.estimates.revoke.costUsd})` : ''}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EMERGENCY TAB ── */}
      {tab === 'emergency' && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Emergency Access</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
              Designate a trusted wallet that can access all your records in an emergency.
            </p>
          </div>
          <EmergencyAccess contractAddress={reg.contractAddress} />
        </div>
      )}

      {/* ── DELEGATES TAB ── */}
{tab === 'delegates' && (
  <div>
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Delegate Uploaders</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
        Allow trusted wallets (e.g. your doctor) to upload records on your behalf.
      </p>
    </div>
    <DelegateManager contractAddress={reg.contractAddress} encKey={encKey} />
  </div>
)}

      {/* ── TRANSACTIONS TAB ── */}
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
          {reg.txLog.length === 0 ? (
            <Empty icon="⛓" title="No transactions yet" desc="Upload a record or grant access to create on-chain transactions." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {reg.txLog.map((tx, i) => {
                const icons: Record<string,string> = { deploy:'🚀', upload:'📄', grant:'🔑', revoke:'🚫', remove:'🗑' }
                return (
                  <div key={i} style={{ ...S.card, padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.7rem', animation: `fadeUp 0.18s ease ${i*0.03}s both` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(0,229,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>
                      {icons[tx.type] ?? '📄'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>{tx.label} — {tx.detail}</div>
                      <a href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--mono)', fontSize: '0.67rem', color: 'var(--teal)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                        {tx.hash}
                      </a>
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

      {/* ── AUDIT TAB ── */}
      {tab === 'audit' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Immutable Audit Log</h3>
            <Button variant="outline" size="sm" onClick={exportAudit}>Export CSV</Button>
          </div>
          <div style={S.infoAmber}>⚠ Entries marked [chain] correspond to real {targetChain.name} transactions.</div>
          {reg.auditLog.length === 0 ? (
            <Empty icon="📋" title="Audit log is empty" desc="All on-chain events will appear here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {reg.auditLog.map((e, i) => {
                const dotColor = { teal: 'var(--teal)', green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)' }[e.color]
                return (
                  <div key={i} style={{ ...S.card, padding: '0.65rem 0.875rem', display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.8rem', animation: `fadeUp 0.15s ease ${i*0.02}s both` }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, color: 'var(--text2)', lineHeight: 1.55, wordBreak: 'break-all' }}>
                      {e.msg}
                      {e.txHash && (
                        <a href={`${EXPLORER}/tx/${e.txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--teal)', textDecoration: 'none' }}>
                          [chain ↗]
                        </a>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text3)', flexShrink: 0 }}>
                      {new Date(e.ts).toLocaleTimeString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD MODAL ── */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="📄 Upload Health Record"
        onOpen={() => gas.estimateUpload(
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          'QmExample',
          uploadForm.type || 'Lab Results',
          uploadForm.title || 'Record'
        )}
      >
        <div style={S.infoTeal}>🔐 Encrypted in-browser with AES-256-GCM. Only the IPFS CID + hash go on-chain.</div>
        <Field label="Record Type" required>
          <Select value={uploadForm.type} onChange={e => setUploadForm(p => ({ ...p, type: e.target.value as RecordType }))}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <GasEstimateTag costEth={gas.estimates.upload?.costEth ?? ''} costUsd={gas.estimates.upload?.costUsd ?? null} loading={gas.loading.upload ?? false} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button loading={uploadLoading} onClick={handleUpload}>🔐 Encrypt & Anchor on Base</Button>
          </div>
        </div>
      </Modal>

      {/* ── UPDATE MODAL ── */}
      <Modal open={updateOpen} onClose={() => setUpdateOpen(false)} title="✏️ Update Health Record">
        <div style={S.infoTeal}>📝 Creates a new version on-chain. Previous version is preserved in history.</div>
        {updateTarget && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: '1rem', fontFamily: 'var(--mono)' }}>
            Updating: {updateTarget.title} (v{updateTarget.version} → v{updateTarget.version + 1})
          </div>
        )}
        <Field label="Record Type" required>
          <Select value={updateForm.type} onChange={e => setUpdateForm(p => ({ ...p, type: e.target.value as RecordType }))}>
            <option value="">Select…</option>
            {RECORD_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
          <Field label="Title" required>
            <Input value={updateForm.title} onChange={e => setUpdateForm(p => ({ ...p, title: e.target.value }))} />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={updateForm.date} onChange={e => setUpdateForm(p => ({ ...p, date: e.target.value }))} />
          </Field>
        </div>
        <Field label="Healthcare Provider">
          <Input value={updateForm.provider} onChange={e => setUpdateForm(p => ({ ...p, provider: e.target.value }))} />
        </Field>
        <Field label="Clinical Notes">
          <Textarea value={updateForm.notes} onChange={e => setUpdateForm(p => ({ ...p, notes: e.target.value }))} />
        </Field>
        <Field label="Replace Attachment">
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.dcm,.txt" onChange={e => setUpdateFile(e.target.files?.[0] ?? null)} />
            <div style={{ padding: '0.55rem 0.875rem', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: '0.875rem', cursor: 'pointer' }}>
              {updateFile ? `✅ ${updateFile.name} (${(updateFile.size/1024).toFixed(1)} KB)` : '📎 Click to replace attachment (optional)'}
            </div>
          </label>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Button variant="outline" onClick={() => setUpdateOpen(false)}>Cancel</Button>
          <Button loading={updateLoading} onClick={handleUpdate}>📝 Update Record</Button>
        </div>
      </Modal>

      {/* ── GRANT MODAL ── */}
      <Modal open={grantOpen} onClose={() => setGrantOpen(false)} title="🔑 Grant Record Access">
        <div style={S.infoTeal}>
          📜 Calls <code style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>grantAccess()</code> on {targetChain.name}. The grantee's decryption key is stored on-chain.
        </div>
        <Field label="Recipient Name" required>
          <Input value={grantForm.name} placeholder="e.g. Dr. Marcus Lee" onChange={e => setGrantForm(p => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Wallet Address or ENS name" required>
          <div style={{ position: 'relative' }}>
            <Input
              value={grantForm.address}
              placeholder="0x… or doctor.eth"
              style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', paddingRight: '5rem' }}
              onChange={e => { setGrantForm(p => ({ ...p, address: e.target.value })); ens.reset() }}
              onBlur={async () => {
                const val = grantForm.address.trim()
                if (!val) return
                const resolved = await ens.resolve(val)
                if (resolved && resolved !== val) setGrantForm(p => ({ ...p, address: resolved }))
              }}
            />
            <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {ens.resolving && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--teal)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
              {ens.ensName && !ens.resolving && <span style={{ color: 'var(--green)' }}>✓ {ens.ensName}</span>}
              {ens.error && <span style={{ color: 'var(--red)' }}>✗</span>}
            </div>
          </div>
          {ens.resolved && ens.ensName && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: '0.35rem', fontFamily: 'var(--mono)', padding: '0.3rem 0.6rem', background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 6 }}>
              ✅ Resolved: {ens.resolved}
            </div>
          )}
          {ens.error && (
            <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.35rem', padding: '0.3rem 0.6rem', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 6 }}>
              ✗ {ens.error}
            </div>
          )}
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
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
          {reg.records.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>No records uploaded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {reg.records.map(r => {
                const checked = selectedRecords.includes(r.id)
                return (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', padding: '0.3rem 0.65rem', borderRadius: 7, background: checked ? 'rgba(0,229,204,0.08)' : 'var(--bg)', border: `1px solid ${checked ? 'var(--teal)' : 'var(--border2)'}`, color: checked ? 'var(--teal)' : 'var(--text2)', transition: 'all 0.15s' }}>
                    <input type="checkbox" checked={checked} style={{ accentColor: 'var(--teal)' }} onChange={e => setSelectedRecords(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />
                    {r.type}: {r.title} {r.version > 1 ? `(v${r.version})` : ''}
                  </label>
                )
              })}
            </div>
          )}
        </Field>
        <Field label="Purpose / Notes">
          <Textarea value={grantForm.purpose} placeholder="e.g. Cardiology referral…" style={{ minHeight: 55 }} onChange={e => setGrantForm(p => ({ ...p, purpose: e.target.value }))} />
        </Field>
        <Field label="Grantee Signature" required hint="The grantee opens VeriHealth, selects 'I'm a Grantee', clicks 'Sign to Unlock', then copies and sends you their signature.">
          <Textarea value={grantForm.granteeSig} placeholder="0x… (paste signature from grantee)" style={{ minHeight: 55, fontFamily: 'var(--mono)', fontSize: '0.72rem' }} onChange={e => setGrantForm(p => ({ ...p, granteeSig: e.target.value }))} />
        </Field>
        <div style={{ ...S.infoAmber, marginBottom: 0 }}>
          ⚠ Without the grantee's signature, they cannot decrypt the record content.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <GasEstimateTag costEth={gas.estimates.grant?.costEth ?? ''} costUsd={gas.estimates.grant?.costUsd ?? null} loading={gas.loading.grant ?? false} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button variant="success" loading={grantLoading} onClick={handleGrant} disabled={!encKey}>
              {encKey ? '📜 Sign & Grant on Base' : '🔑 Waiting for encryption key…'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── VIEW MODAL ── */}
      <Modal open={!!viewRecord} onClose={() => { setViewRecord(null); setViewFile(null) }} title="🔍 Record Details" maxWidth={540}>
        {viewRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <RecordBadge type={viewRecord.type} />
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {viewRecord.version > 1 && (
                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 4, background: 'rgba(0,82,255,0.1)', color: '#6699ff', border: '1px solid rgba(0,82,255,0.2)' }}>v{viewRecord.version}</span>
                )}
                <span style={{ fontSize: '0.72rem', color: 'var(--green)' }}>🔒 AES-256-GCM encrypted</span>
              </div>
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
            {viewFile && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '0.4rem' }}>Attached File</div>
                <button
                  onClick={() => setFileViewerOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.875rem', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border2)', cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                >
                  <span style={{ fontSize: '1.2rem' }}>📎</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewFile.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{(viewFile.size / 1024).toFixed(1)} KB · Click to view</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--teal)' }}>Open →</span>
                </button>
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
            {viewRecord.previousId && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: '0.2rem' }}>Previous Version</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text3)', wordBreak: 'break-all' }}>{viewRecord.previousId}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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

      {/* ── FILE VIEWER ── */}
      <FileViewer
        open={fileViewerOpen}
        onClose={() => setFileViewerOpen(false)}
        file={viewFile}
        recordTitle={viewRecord?.title ?? ''}
      />
    </div>
  )
}