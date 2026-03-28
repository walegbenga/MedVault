import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { targetChain } from '@/lib/wagmi'
import type { useRegistry } from '@/hooks/useRegistry'
import type { HealthRecord, AccessGrant, AuditEntry } from '@/lib/types'

interface Props {
  reg: ReturnType<typeof useRegistry>
  onBack: () => void
}

export function Compliance({ reg, onBack }: Props) {
  const { address } = useAccount()
  const { toast }   = useToast()
  const [exporting, setExporting] = useState(false)

  const exportCSV = () => {
    const rows = [
      'Timestamp,OnChain,TxHash,Message',
      ...reg.auditLog.map(e =>
        `"${new Date(e.ts).toISOString()}","${e.onChain}","${e.txHash ?? ''}","${e.msg.replace(/"/g, "'")}"`
      )
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `verihealth-audit-${Date.now()}.csv`
    a.click()
    toast('ok', 'CSV exported.')
  }

  const exportFHIR = async () => {
    setExporting(true)
    try {
      const bundle = buildFHIRBundle(address ?? '', reg.records, reg.grants, reg.auditLog)
      const blob   = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const a      = document.createElement('a')
      a.href       = URL.createObjectURL(blob)
      a.download   = `verihealth-fhir-${Date.now()}.json`
      a.click()
      toast('ok', 'FHIR R4 bundle exported.')
    } catch (e: unknown) {
      toast('err', e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.82rem', color: 'var(--text2)',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '0.4rem 0', marginBottom: '1.5rem',
          fontFamily: 'var(--font)',
        }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.4rem' }}>
          🏛 Compliance & Privacy
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.65 }}>
          VeriHealth is built with patient privacy and data sovereignty at its core.
          Export your records in standard medical formats for compliance and portability.
        </p>
      </div>

      {/* HIPAA Section */}
      <Section title="🔒 HIPAA Alignment">
        <ComplianceItem icon="✅" title="Patient-controlled access" desc="You are the sole owner of your registry contract. No third party can access your data without your explicit on-chain grant." />
        <ComplianceItem icon="✅" title="End-to-end encryption" desc="All record content is encrypted client-side with AES-256-GCM before leaving your device. The server never sees plaintext." />
        <ComplianceItem icon="✅" title="Immutable audit trail" desc="Every grant, revoke, upload, and access is permanently recorded on-chain and cannot be altered or deleted." />
        <ComplianceItem icon="✅" title="Minimum necessary access" desc="Grants are per-record. You can share exactly one record with exactly one grantee, nothing more." />
        <ComplianceItem icon="✅" title="Right to revoke" desc="Access grants can be revoked at any time. Revocation deletes the grantee's decryption key from the contract immediately." />
        <ComplianceItem icon="⚠" title="Business Associate Agreement" desc="VeriHealth is a patient-facing tool. If used in a clinical setting, a BAA with your cloud provider (Vercel, Pinata) may be required." warn />
      </Section>

      {/* GDPR Section */}
      <Section title="🇪🇺 GDPR Alignment">
        <ComplianceItem icon="✅" title="Right to access" desc="You can export all your data at any time using the export tools below." />
        <ComplianceItem icon="✅" title="Right to portability" desc="Records can be exported in HL7 FHIR R4 format — the international standard for health data interoperability." />
        <ComplianceItem icon="✅" title="Data minimization" desc="VeriHealth stores only what is necessary — encrypted blobs on IPFS, content hashes on-chain, no PII on servers." />
        <ComplianceItem icon="⚠" title="Right to erasure" desc="Records can be soft-deleted on-chain but IPFS blobs are content-addressed and cannot be fully erased once pinned. Consider this before uploading." warn />
      </Section>

      {/* Export Section */}
      <Section title="📤 Data Export">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <ExportCard
            icon="📊"
            title="Audit Log — CSV"
            desc={`${reg.auditLog.length} entries · Compatible with Excel, Google Sheets, and compliance tools.`}
            onExport={exportCSV}
            disabled={reg.auditLog.length === 0}
          />
          <ExportCard
            icon="🏥"
            title="Health Records — HL7 FHIR R4"
            desc={`${reg.records.length} records · International standard for health data. Compatible with EHR systems.`}
            onExport={exportFHIR}
            loading={exporting}
            disabled={reg.records.length === 0}
          />
        </div>
      </Section>

      {/* Chain info */}
      <Section title="⛓ On-Chain Transparency">
        <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
          <p>All VeriHealth operations are recorded on <strong>{targetChain.name}</strong> — a public, immutable blockchain. Anyone can independently verify:</p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>When records were uploaded</li>
            <li>When access was granted or revoked</li>
            <li>Which wallet performed each action</li>
            <li>The content hash of every record (without revealing the content)</li>
          </ul>
        </div>
      </Section>

      {/* Bottom back button */}
      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <Button variant="outline" onClick={onBack}>← Back to Dashboard</Button>
      </div>

    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.875rem', color: 'var(--text)' }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {children}
      </div>
    </div>
  )
}

function ComplianceItem({ icon, title, desc, warn }: { icon: string; title: string; desc: string; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 9,
      background: warn ? 'rgba(255,179,0,0.04)' : 'var(--s1)',
      border: `1px solid ${warn ? 'rgba(255,179,0,0.2)' : 'var(--border)'}`,
    }}>
      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.2rem' }}>{title}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  )
}

function ExportCard({ icon, title, desc, onExport, loading, disabled }: {
  icon: string; title: string; desc: string
  onExport: () => void; loading?: boolean; disabled?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.875rem 1rem', borderRadius: 10,
      background: 'var(--s1)', border: '1px solid var(--border)',
      flexWrap: 'wrap', gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
        <span style={{ fontSize: '1.4rem' }}>{icon}</span>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{desc}</div>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onExport} loading={loading} disabled={disabled}>
        ⬇ Export
      </Button>
    </div>
  )
}

function buildFHIRBundle(
  patientAddress: string,
  records: HealthRecord[],
  grants: AccessGrant[],
  auditLog: AuditEntry[]
) {
  const now = new Date().toISOString()

  const patientResource = {
    resourceType: 'Patient',
    id: patientAddress.toLowerCase(),
    identifier: [{ system: 'urn:verihealth:wallet', value: patientAddress.toLowerCase() }],
    meta: { lastUpdated: now },
  }

  const documentReferences = records.map(r => ({
    resourceType: 'DocumentReference',
    id:     r.id,
    status: 'current',
    type: { coding: [{ system: 'urn:verihealth:record-type', code: r.type.toLowerCase().replace(/\s+/g, '-'), display: r.type }] },
    subject: { reference: `Patient/${patientAddress.toLowerCase()}` },
    date:    r.date,
    author:  [{ display: r.provider }],
    content: [{ attachment: { url: `ipfs://${r.ipfsCid}`, title: r.title } }],
    securityLabel: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality', code: 'R', display: 'Restricted' }] }],
    extension: [
      { url: 'urn:verihealth:content-hash', valueString: r.id },
      { url: 'urn:verihealth:version', valueInteger: r.version },
      { url: 'urn:verihealth:encrypted', valueBoolean: r.encrypted },
    ],
  }))

  const consentResources = grants.map(g => ({
    resourceType: 'Consent',
    id:     `grant-${g.grantId}`,
    status: 'active',
    scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy', display: 'Privacy Consent' }] },
    category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0', display: 'Consent Document' }] }],
    patient:  { reference: `Patient/${patientAddress.toLowerCase()}` },
    dateTime: new Date(g.ts).toISOString(),
    performer: [{ display: g.name, identifier: { value: g.address } }],
    provision: {
      type:   'permit',
      period: g.expiry ? { end: g.expiry } : undefined,
      data:   g.recordIds.map(id => ({ meaning: 'instance', reference: { reference: `DocumentReference/${id}` } })),
    },
    extension: [
      { url: 'urn:verihealth:grant-id', valueString: String(g.grantId) },
      { url: 'urn:verihealth:role', valueString: g.role },
    ],
  }))

  const auditEvents = auditLog.map((e, i) => ({
    resourceType: 'AuditEvent',
    id:       `audit-${i}`,
    type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110100', display: 'Application Activity' },
    recorded: new Date(e.ts).toISOString(),
    outcome:  '0',
    agent:    [{ requestor: true, who: { identifier: { value: patientAddress.toLowerCase() } } }],
    source: {
      observer: { display: 'VeriHealth' },
      type: [{ system: 'http://terminology.hl7.org/CodeSystem/security-source-type', code: '4', display: 'Application Server' }],
    },
    entity: [{ what: { display: e.msg }, description: e.txHash ?? '' }],
  }))

  return {
    resourceType: 'Bundle',
    id:        `verihealth-export-${Date.now()}`,
    type:      'document',
    timestamp: now,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'] },
    entry: [
      { resource: patientResource },
      ...documentReferences.map(r => ({ resource: r })),
      ...consentResources.map(r => ({ resource: r })),
      ...auditEvents.map(r => ({ resource: r })),
    ],
  }
}