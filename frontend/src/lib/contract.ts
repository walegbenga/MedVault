import { type Address } from 'viem'
import { env } from '@/env'
import artifact from './MedVaultRegistry.json'

export const CONTRACT_ABI      = artifact.abi as const
export const CONTRACT_BYTECODE = artifact.bytecode as `0x${string}`

export const blobKey = (cid: string) => `medvault_blob_${cid}`

const contractKey = (walletAddr: string) =>
  `medvault_contract_${walletAddr.toLowerCase()}`

export function getContractAddress(walletAddr: string): Address | null {
  // VITE_CONTRACT_ADDRESS always wins if set — never overridden
  if (env.contractAddress) return env.contractAddress as Address
  const saved = localStorage.getItem(contractKey(walletAddr))
  return saved ? (saved as Address) : null
}

export function saveContractAddress(walletAddr: string, addr: Address) {
  // Only save to localStorage if no env override is set
  // This prevents new deployments from overwriting a pinned address
  if (env.contractAddress) return
  localStorage.setItem(contractKey(walletAddr), addr)
}