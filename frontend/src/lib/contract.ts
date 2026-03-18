import { type Address } from 'viem'
import { env } from '@/env'
import artifact from './MedVaultRegistry.json'

export const CONTRACT_ABI = artifact.abi as const
export const CONTRACT_BYTECODE = artifact.bytecode as `0x${string}`

export const contractKey = (walletAddr: string) =>
  `medvault_contract_${walletAddr.toLowerCase()}`

export const blobKey = (cid: string) => `medvault_blob_${cid}`

export function getContractAddress(walletAddr: string): Address | null {
  if (env.contractAddress) return env.contractAddress as Address
  const saved = localStorage.getItem(contractKey(walletAddr))
  return saved ? (saved as Address) : null
}

export function saveContractAddress(walletAddr: string, addr: Address) {
  localStorage.setItem(contractKey(walletAddr), addr)
}