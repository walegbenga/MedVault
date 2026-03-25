import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, parseEventLogs, type Address, type Hash } from 'viem'
import { keccak256, toUtf8Bytes } from 'ethers'
import {
  CONTRACT_ABI, CONTRACT_BYTECODE,
  getContractAddress, saveContractAddress,
} from '@/lib/contract'
import {
  encrypt, decrypt, encryptAesKeyForGrantee,
} from '@/lib/crypto'
import { pinBlob, fetchBlob } from '@/lib/ipfs'
import { store } from '@/lib/store'
import type { HealthRecord, AccessGrant, TxEntry, AuditEntry, RecordType } from '@/lib/types'

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export function useRegistry(encKey: CryptoKey | null, encSig?: string | null) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [contractAddress, setContractAddress] = useState<Address | null>(
    address ? getContractAddress(address) : null
  )
  const [records,    setRecords]    = useState<HealthRecord[]>(() => address ? store.records.load(address) : [])
  const [grants,     setGrants]     = useState<AccessGrant[]>( () => address ? store.grants.load(address)  : [])
  const [txLog,      setTxLog]      = useState<TxEntry[]>(     () => address ? store.txlog.load(address)   : [])
  const [auditLog,   setAuditLog]   = useState<AuditEntry[]>(  () => address ? store.audit.load(address)   : [])
  const [deploying,  setDeploying]  = useState(false)
  const [deployStep, setDeployStep] = useState(0)

  const addTx = useCallback((entry: Omit<TxEntry, 'ts'>) => {
    setTxLog(prev => {
      const next = [serialize({ ...entry, ts: Date.now() }), ...prev]
      if (address) store.txlog.save(address, next)
      return next
    })
  }, [address])

  const addAudit = useCallback((entry: Omit<AuditEntry, 'ts'>) => {
    setAuditLog(prev => {
      const next = [serialize({ ...entry, ts: Date.now() }), ...prev]
      if (address) store.audit.save(address, next)
      return next
    })
  }, [address])

  const getInstance = useCallback((addr: Address) => {
    if (!publicClient || !walletClient) throw new Error('Wallet client not ready')
    return getContract({
      address: addr,
      abi: CONTRACT_ABI,
      client: { public: publicClient, wallet: walletClient },
    })
  }, [publicClient, walletClient])

  // ── deploy ───────────────────────────────────────────────────────────────
  const deployRegistry = useCallback(async (): Promise<Address> => {
    if (!walletClient || !publicClient || !address) throw new Error('Wallet not connected')
    setDeploying(true); setDeployStep(1)
    try {
      setDeployStep(2)
      const hash = await walletClient.deployContract({
        abi: CONTRACT_ABI, bytecode: CONTRACT_BYTECODE, args: [],
      })
      setDeployStep(3)
      addAudit({ color: 'teal', msg: `Deploy tx sent: ${hash}`, onChain: true, txHash: hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
      setDeployStep(4)
      if (!receipt.contractAddress) throw new Error('No contract address in receipt')
      const addr = receipt.contractAddress
      saveContractAddress(address, addr)
      setContractAddress(addr)
      addTx({ type: 'deploy', label: 'Registry deployed', detail: addr, hash, confirmed: true })
      addAudit({ color: 'teal', msg: `Registry deployed at ${addr} | block ${receipt.blockNumber.toString()}`, onChain: true, txHash: hash })
      return addr
    } finally { setDeploying(false); setDeployStep(0) }
  }, [walletClient, publicClient, address, addTx, addAudit])

  // ── uploadRecord ─────────────────────────────────────────────────────────
  const uploadRecord = useCallback(async (params: {
    type: RecordType; title: string; provider: string
    date: string; notes: string; file?: File
  }) => {
    if (!address || !publicClient || !walletClient) throw new Error('Wallet not connected')
    const addr = contractAddress ?? await deployRegistry()
    const instance = getInstance(addr)

    const metadata = { ...params, wallet: address, ts: Date.now() }
    let payload: string

    if (encKey) {
      const encrypted = await encrypt(JSON.stringify(metadata), encKey)
      payload = JSON.stringify({ enc: encrypted.ciphertext, iv: encrypted.iv })
    } else {
      payload = JSON.stringify({ plain: JSON.stringify(metadata) })
    }

    if (params.file) {
      const fileData = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload  = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(params.file!)
      })
      const parsed = JSON.parse(payload)
      parsed.file = { name: params.file.name, size: params.file.size, data: fileData }
      payload = JSON.stringify(parsed)
    }

    const ipfsCid = await pinBlob(payload, `${params.type}: ${params.title}`)
    const contentHash = keccak256(toUtf8Bytes(payload)) as Hash

    const hash = await instance.write.addRecord([contentHash, ipfsCid, params.type, params.title])
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })

    const record: HealthRecord = serialize({
      id: contentHash, ipfsCid,
      type: params.type, title: params.title,
      provider: params.provider || 'Unknown',
      date: params.date, notes: params.notes,
      txHash: hash, blockNumber: receipt.blockNumber.toString(),
      encrypted: !!encKey, accessCount: 0, ts: Date.now(),
    })

    setRecords(prev => {
      const next = [...prev, record]
      store.records.save(address, next)
      return next
    })
    addTx({ type: 'upload', label: 'Record uploaded', detail: `${params.type}: ${params.title}`, hash, confirmed: true })
    addAudit({ color: 'teal', msg: `Record anchored: "${params.title}" | block ${receipt.blockNumber.toString()}`, onChain: true, txHash: hash })
    return record
  }, [address, contractAddress, publicClient, walletClient, encKey, deployRegistry, getInstance, addTx, addAudit])

  // ── removeRecord ─────────────────────────────────────────────────────────
  const removeRecord = useCallback(async (recordId: Hash) => {
    if (!address || !publicClient || !contractAddress) throw new Error('Not connected')
    const instance = getInstance(contractAddress)
    const hash = await instance.write.removeRecord([recordId])
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
    const rec = records.find(r => r.id === recordId)
    setRecords(prev => {
      const next = prev.filter(r => r.id !== recordId)
      store.records.save(address, next)
      return next
    })
    addTx({ type: 'remove', label: 'Record removed', detail: rec?.title ?? recordId, hash, confirmed: true })
    addAudit({ color: 'red', msg: `Record removed: "${rec?.title}" | block ${receipt.blockNumber.toString()}`, onChain: true, txHash: hash })
  }, [address, contractAddress, publicClient, records, getInstance, addTx, addAudit])

  // ── decryptRecord ─────────────────────────────────────────────────────────
  const decryptRecord = useCallback(async (record: HealthRecord): Promise<string> => {
    if (!encKey) return record.notes
    try {
      const raw = await fetchBlob(record.ipfsCid)
      if (!raw) return record.notes
      const parsed = JSON.parse(raw)
      if (!parsed.enc) return record.notes
      const plain = await decrypt({ ciphertext: parsed.enc, iv: parsed.iv }, encKey)
      return JSON.parse(plain).notes ?? record.notes
    } catch { return '[decryption failed]' }
  }, [encKey])

  // ── grantAccess ───────────────────────────────────────────────────────────
  const grantAccess = useCallback(async (params: {
    name: string; granteeAddress: Address; role: string
    purpose: string; recordIds: Hash[]; titles: string[]
    expiry: string | null; granteeSig: string
  }) => {
    if (!address || !publicClient || !contractAddress) throw new Error('Not connected')
    if (!encKey) throw new Error('Encryption key not ready')
    const instance = getInstance(contractAddress)
    const expiresAt = params.expiry
      ? BigInt(Math.floor(new Date(params.expiry).getTime() / 1000))
      : 0n

    // Encrypt one AES key envelope per record for this grantee
    const ciphertexts: string[] = []
    const ivs: string[]         = []

    for (const _rid of params.recordIds) {
      const envelope = await encryptAesKeyForGrantee(encKey, params.granteeSig)
      ciphertexts.push(envelope.ciphertext)
      ivs.push(envelope.iv)
    }

    console.log('Granting access with:', {
      grantee: params.granteeAddress,
      recordIds: params.recordIds,
      expiresAt: expiresAt.toString(),
      ciphertexts: ciphertexts.map(c => c.slice(0, 20)),
      ivs,
    })

    // Single tx — grants access + stores all key envelopes atomically on-chain
    const hash = await instance.write.grantAccess([
      params.granteeAddress,
      params.recordIds,
      expiresAt,
      ciphertexts,
      ivs,
    ])
    const receipt = await publicClient.waitForTransactionReceipt({
      hash, confirmations: 1, timeout: 120_000,
    })

    console.log('Grant tx confirmed:', hash, '| block:', receipt.blockNumber.toString())

    // Parse grantId from event
    let grantId = grants.length
    try {
      const logs = parseEventLogs({
        abi: CONTRACT_ABI, logs: receipt.logs, eventName: 'AccessGranted',
      })
      if (logs.length > 0) {
        const log = logs[0] as unknown as { args: { grantId: bigint } }
        grantId = Number(log.args.grantId)
      }
    } catch { /* use fallback */ }

    setRecords(prev => {
      const next = prev.map(r =>
        params.recordIds.includes(r.id)
          ? { ...r, accessCount: r.accessCount + 1 }
          : r
      )
      store.records.save(address, next)
      return next
    })

    const grant: AccessGrant = serialize({
      grantId, name: params.name, address: params.granteeAddress,
      role: params.role, purpose: params.purpose,
      recordIds: params.recordIds, titles: params.titles,
      expiry: params.expiry, expiresAt: expiresAt.toString(),
      txHash: hash, blockNumber: receipt.blockNumber.toString(), ts: Date.now(),
    })

    setGrants(prev => {
      const next = [...prev, grant]
      store.grants.save(address, next)
      return next
    })
    addTx({ type: 'grant', label: 'Access granted', detail: `${params.name} (${params.role})`, hash, confirmed: true })
    addAudit({ color: 'green', msg: `Access granted → ${params.name} (${params.role}) for: ${params.titles.join(', ')} | block ${receipt.blockNumber.toString()}`, onChain: true, txHash: hash })
    return grant
  }, [address, contractAddress, publicClient, encKey, grants, records, getInstance, addTx, addAudit])

  // ── revokeAccess ──────────────────────────────────────────────────────────
  const revokeAccess = useCallback(async (grantId: number) => {
    if (!address || !publicClient || !contractAddress) throw new Error('Not connected')
    const instance = getInstance(contractAddress)
    const hash = await instance.write.revokeAccess([BigInt(grantId)])
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
    const g = grants.find(x => x.grantId === grantId)
    setGrants(prev => {
      const next = prev.filter(x => x.grantId !== grantId)
      store.grants.save(address, next)
      return next
    })
    addTx({ type: 'revoke', label: 'Access revoked', detail: g?.name ?? `Grant #${grantId}`, hash, confirmed: true })
    addAudit({ color: 'red', msg: `Access revoked: ${g?.name} (${g?.role}) | block ${receipt.blockNumber.toString()}`, onChain: true, txHash: hash })
  }, [address, contractAddress, publicClient, grants, getInstance, addTx, addAudit])

  return {
    contractAddress, records, grants, txLog, auditLog,
    deploying, deployStep,
    deployRegistry, uploadRecord, removeRecord,
    decryptRecord, grantAccess, revokeAccess,
  }
}