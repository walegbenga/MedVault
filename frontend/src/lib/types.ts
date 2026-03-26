import type { Address, Hash } from 'viem'

export type RecordType =
  | 'Lab Results'
  | 'Prescription'
  | 'Medical Imaging'
  | 'Doctor Visit'
  | 'Vaccine Record'
  | 'Surgery Report'
  | 'Mental Health Note'
  | 'Other'

export interface HealthRecord {
  id: Hash
  ipfsCid: string
  type: RecordType
  title: string
  provider: string
  date: string
  notes: string
  txHash: Hash
  blockNumber: string
  encrypted: boolean
  accessCount: number
  hasFile?: boolean   // ← add this
  version: number        // ← add
  previousId?: Hash      // ← add
  ts: number
}

export interface AccessGrant {
  grantId: number
  name: string
  address: Address
  role: string
  purpose: string
  recordIds: Hash[]
  titles: string[]
  expiry: string | null
  expiresAt: string
  txHash: Hash
  blockNumber: string
  ts: number
}

export interface TxEntry {
  type: 'deploy' | 'upload' | 'grant' | 'revoke' | 'remove'
  label: string
  detail: string
  hash: Hash
  confirmed: boolean
  ts: number
}

export interface AuditEntry {
  color: 'teal' | 'green' | 'red' | 'amber'
  msg: string
  onChain: boolean
  txHash?: Hash
  ts: number
}