import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from '@wagmi/connectors'
import { env } from '@/env'

const targetChain = env.network === 'base' ? base : baseSepolia

const rpcUrl = env.rpcUrl || (
  env.network === 'base'
    ? 'https://mainnet.base.org'
    : 'https://sepolia.base.org'
)

export const config = createConfig({
  chains: [targetChain],
  connectors: [
    /**
     * injected() with EIP-6963 discovery:
     * Automatically detects ALL installed wallets that implement EIP-6963
     * (MetaMask, Rabby, Brave, Frame, OKX, Phantom EVM, etc.)
     * Each shows up as a separate option in the wallet picker.
     */
    injected({ target: 'metaMask' }),
    injected({ shimDisconnect: true }), // catches all other EIP-6963 wallets

    /**
     * Coinbase Wallet — uses its own SDK for deep linking and smart wallet support
     */
    coinbaseWallet({
      appName: env.appName,
      appLogoUrl: env.appIcon || undefined,
    }),

    /**
     * WalletConnect v2 — QR code / deep link for any mobile wallet
     * projectId is read from VITE_WALLETCONNECT_PROJECT_ID in .env.local
     */
    walletConnect({
      projectId: env.walletConnectProjectId,
      metadata: {
        name:        env.appName,
        description: env.appDescription,
        url:         env.appUrl,
        icons:       env.appIcon ? [env.appIcon] : [],
      },
      showQrModal: true,
    }),
  ],
  transports: {
    [targetChain.id]: http(rpcUrl),
  },
})

export { targetChain }
