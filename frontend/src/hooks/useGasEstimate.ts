import { useState, useCallback } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { getContract, type Address } from 'viem'
import { CONTRACT_ABI } from '@/lib/contract'

interface GasEstimate {
  gasUnits:  bigint
  gasPriceGwei: string
  costEth:   string
  costUsd:   string | null
}

async function getEthPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    )
    if (!res.ok) return null
    const data = await res.json() as { ethereum: { usd: number } }
    return data.ethereum.usd
  } catch {
    return null
  }
}

export function useGasEstimate(contractAddress: Address | null) {
  const { address } = useAccount()
  const publicClient = usePublicClient()

  const [estimates, setEstimates] = useState<Record<string, GasEstimate>>({})
  const [loading,   setLoading]   = useState<Record<string, boolean>>({})

  const estimate = useCallback(async (
    action: string,
    fn: () => Promise<bigint>
  ): Promise<GasEstimate | null> => {
    if (!publicClient || !address || !contractAddress) return null

    setLoading(prev => ({ ...prev, [action]: true }))
    try {
      const [gasUnits, gasPrice, ethPrice] = await Promise.all([
        fn(),
        publicClient.getGasPrice(),
        getEthPrice(),
      ])

      const costWei  = gasUnits * gasPrice
      const costEth  = (Number(costWei) / 1e18).toFixed(8)
      const costUsd  = ethPrice
        ? `$${(Number(costEth) * ethPrice).toFixed(4)}`
        : null
      const gasPriceGwei = (Number(gasPrice) / 1e9).toFixed(4)

      const result: GasEstimate = { gasUnits, gasPriceGwei, costEth, costUsd }
      setEstimates(prev => ({ ...prev, [action]: result }))
      return result
    } catch (e) {
      console.warn(`Gas estimate failed for ${action}:`, e)
      return null
    } finally {
      setLoading(prev => ({ ...prev, [action]: false }))
    }
  }, [publicClient, address, contractAddress])

  const estimateUpload = useCallback(async (
    id: `0x${string}`,
    cid: string,
    rType: string,
    title: string
  ) => {
    if (!publicClient || !address || !contractAddress) return null
    return estimate('upload', () =>
      publicClient.estimateContractGas({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'addRecord',
        args: [id, cid, rType, title],
        account: address,
      })
    )
  }, [publicClient, address, contractAddress, estimate])

  const estimateGrant = useCallback(async (
    grantee: Address,
    recordIds: `0x${string}`[],
    expiresAt: bigint,
    ciphertexts: string[],
    ivs: string[]
  ) => {
    if (!publicClient || !address || !contractAddress) return null
    return estimate('grant', () =>
      publicClient.estimateContractGas({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'grantAccess',
        args: [grantee, recordIds, expiresAt, ciphertexts, ivs],
        account: address,
      })
    )
  }, [publicClient, address, contractAddress, estimate])

  const estimateRevoke = useCallback(async (grantId: number) => {
    if (!publicClient || !address || !contractAddress) return null
    return estimate('revoke', () =>
      publicClient.estimateContractGas({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'revokeAccess',
        args: [BigInt(grantId)],
        account: address,
      })
    )
  }, [publicClient, address, contractAddress, estimate])

  const estimateDeploy = useCallback(async () => {
    if (!publicClient || !address) return null
    setLoading(prev => ({ ...prev, deploy: true }))
    try {
      const [gasPrice, ethPrice] = await Promise.all([
        publicClient.getGasPrice(),
        getEthPrice(),
      ])
      // Deploy is roughly 800k gas for this contract
      const gasUnits = 800_000n
      const costWei  = gasUnits * gasPrice
      const costEth  = (Number(costWei) / 1e18).toFixed(8)
      const costUsd  = ethPrice
        ? `$${(Number(costEth) * ethPrice).toFixed(4)}`
        : null
      const gasPriceGwei = (Number(gasPrice) / 1e9).toFixed(4)
      const result: GasEstimate = { gasUnits, gasPriceGwei, costEth, costUsd }
      setEstimates(prev => ({ ...prev, deploy: result }))
      return result
    } finally {
      setLoading(prev => ({ ...prev, deploy: false }))
    }
  }, [publicClient, address])

  return {
    estimates,
    loading,
    estimateUpload,
    estimateGrant,
    estimateRevoke,
    estimateDeploy,
  }
}