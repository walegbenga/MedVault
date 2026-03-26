import { type Address } from 'viem'
import artifact from './VeriHealthRegistry.json'

export const CONTRACT_ABI      = artifact.abi as const
export const CONTRACT_BYTECODE = artifact.bytecode as `0x${string}`

export const blobKey = (cid: string) => `verihealth_blob_${cid}`

const contractKey = (walletAddr: string) =>
  `verihealth_contract_${walletAddr.toLowerCase()}`

export function getContractAddress(walletAddr: string): Address | null {
  const saved = localStorage.getItem(contractKey(walletAddr))
  return saved ? (saved as Address) : null
}

export function saveContractAddress(walletAddr: string, addr: Address) {
  localStorage.setItem(contractKey(walletAddr), addr)
}