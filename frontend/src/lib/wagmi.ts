import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from '@wagmi/connectors'
import { env } from '@/env'

export const targetChain = env.network === 'base' ? base : baseSepolia

const rpcUrl = env.rpcUrl || (
  env.network === 'base'
    ? 'https://mainnet.base.org'
    : 'https://sepolia.base.org'
)

export const config = createConfig({
  chains: [targetChain],
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
        [targetChain.id]: rpcUrl,
      },
    }),
  ],
  transports: {
    [targetChain.id]: http(rpcUrl, {
      batch: true,
      retryCount: 3,
      retryDelay: 1000,
    }),
  },
})