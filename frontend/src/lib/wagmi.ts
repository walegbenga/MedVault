import { createConfig, http } from 'wagmi'
import { base, baseSepolia, mainnet } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from '@wagmi/connectors'
import { env } from '@/env'

export const targetChain = env.network === 'base' ? base : baseSepolia

// All supported chains
export const supportedChains = [base, baseSepolia, mainnet] as const

const rpcUrl = env.rpcUrl || (
  env.network === 'base'
    ? 'https://mainnet.base.org'
    : 'https://sepolia.base.org'
)

export const config = createConfig({
  chains: [base, baseSepolia, mainnet],
  connectors: [
    injected({ target: 'metaMask' }),
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: env.appName,
      appLogoUrl: env.appIcon || undefined,
    }),
    walletConnect({
      projectId: env.walletConnectProjectId,
      metadata: {
        name:        env.appName,
        description: env.appDescription,
        url:         env.appUrl,
        icons:       env.appIcon ? [env.appIcon] : [],
      },
      showQrModal: true,
      relayUrl: 'wss://relay.walletconnect.com',
      rpcMap: {
        [base.id]:       'https://mainnet.base.org',
        [baseSepolia.id]: 'https://sepolia.base.org',
        [mainnet.id]:    'https://eth.llamarpc.com',
      },
    }),
  ],
  transports: {
    [base.id]:        http('https://mainnet.base.org',    { batch: true, retryCount: 3 }),
    [baseSepolia.id]: http('https://sepolia.base.org',    { batch: true, retryCount: 3 }),
    [mainnet.id]:     http('https://eth.llamarpc.com',    { batch: true, retryCount: 3 }),
  },
})