import type { HealthRecord, AccessGrant, TxEntry, AuditEntry } from './types'

type StoreKey = 'records' | 'grants' | 'txlog' | 'audit'

function key(wallet: string, k: StoreKey) {
  return `verihealth_${k}_${wallet.toLowerCase()}`
}

function load<T>(wallet: string, k: StoreKey): T[] {
  try {
    return JSON.parse(localStorage.getItem(key(wallet, k)) ?? '[]')
  } catch {
    return []
  }
}

function save<T>(wallet: string, k: StoreKey, data: T[]) {
  localStorage.setItem(key(wallet, k), JSON.stringify(data))
}

export const store = {
  records: {
    load: (w: string) => load<HealthRecord>(w, 'records'),
    save: (w: string, d: HealthRecord[]) => save(w, 'records', d),
  },
  grants: {
    load: (w: string) => load<AccessGrant>(w, 'grants'),
    save: (w: string, d: AccessGrant[]) => save(w, 'grants', d),
  },
  txlog: {
    load: (w: string) => load<TxEntry>(w, 'txlog'),
    save: (w: string, d: TxEntry[]) => save(w, 'txlog', d),
  },
  audit: {
    load: (w: string) => load<AuditEntry>(w, 'audit'),
    save: (w: string, d: AuditEntry[]) => save(w, 'txlog', d),
  },
}