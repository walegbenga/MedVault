/**
 * Typed environment config.
 * All VITE_* vars are injected by Vite at build time from .env.local.
 * Nothing here is ever the raw process.env — this is browser-safe.
 */

function required(key: string): string {
  const val = import.meta.env[key]
  if (!val) throw new Error(`Missing required env variable: ${key}. Check frontend/.env.local`)
  return val
}

function optional(key: string, fallback = ''): string {
  return import.meta.env[key] ?? fallback
}

export const env = {
  /** WalletConnect Cloud project ID — required for WalletConnect v2 */
  walletConnectProjectId: required('VITE_WALLETCONNECT_PROJECT_ID'),

  /** App metadata shown in wallet connection prompts */
  appName:        optional('VITE_APP_NAME',        'MedVault'),
  appDescription: optional('VITE_APP_DESCRIPTION', 'Patient-Controlled Health Records on Base'),
  appUrl:         optional('VITE_APP_URL',         typeof window !== 'undefined' ? window.location.origin : ''),
  appIcon:        optional('VITE_APP_ICON',        ''),

  /** 'base' | 'base-sepolia' */
  network:  optional('VITE_NETWORK', 'base') as 'base' | 'base-sepolia',

  /** Pre-deployed registry contract address. Empty = app deploys on first connect. */
  contractAddress: optional('VITE_CONTRACT_ADDRESS'),

  /** Override RPC URL. Empty = use default public endpoint. */
  rpcUrl: optional('VITE_RPC_URL'),
} as const
