# MedVault — Patient-Controlled Health Records on Base

A fully on-chain health records system. Patients own their encrypted records on IPFS, anchored by a personal smart contract on Base. All access is granted/revoked via real on-chain transactions.

---

## Project Structure

```
medvault/
├── contracts/
│   └── MedVaultRegistry.sol        ← Solidity source (deploy this)
├── artifacts/
│   └── MedVaultRegistry.json       ← Compiled ABI + bytecode
├── scripts/
│   └── deploy.js                   ← Hardhat deploy script
├── test/
│   └── MedVaultRegistry.test.js    ← Full test suite (25 tests)
├── frontend/                       ← Vite + React + TypeScript dApp
│   ├── src/
│   │   ├── env.ts                  ← Typed env vars via import.meta.env
│   │   ├── main.tsx                ← Entry point (WagmiProvider + QueryClient)
│   │   ├── App.tsx                 ← Root component + routing logic
│   │   ├── lib/
│   │   │   ├── wagmi.ts            ← wagmi config (EIP-6963 + WalletConnect + Coinbase)
│   │   │   ├── contract.ts         ← ABI import + address management
│   │   │   ├── crypto.ts           ← AES-256-GCM via HKDF + Web Crypto API
│   │   │   ├── store.ts            ← localStorage persistence per wallet
│   │   │   └── types.ts            ← TypeScript types
│   │   ├── hooks/
│   │   │   ├── useEncryptionKey.ts ← Derive AES key from wallet signature
│   │   │   └── useRegistry.ts      ← All contract interactions via wagmi/viem
│   │   ├── components/
│   │   │   ├── WalletConnect.tsx   ← Wallet picker (all EVM wallets)
│   │   │   ├── DeployScreen.tsx    ← Contract deploy flow with step progress
│   │   │   └── ui/                 ← Button, Modal, Toast, Field components
│   │   └── pages/
│   │       ├── LandingPage.tsx     ← Connect screen
│   │       └── Dashboard.tsx       ← Records, Access, Transactions, Audit tabs
│   ├── .env.example                ← Copy to .env.local
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
├── hardhat.config.js
├── foundry.toml
├── package.json
├── .env.example                    ← For the Hardhat project (deploy keys etc.)
└── .npmrc
```

---

## Quick Start

### 1. Smart Contract

```bash
# Install Hardhat deps
npm install

# Run tests
npm test

# Deploy to Base Sepolia testnet first
npm run deploy:testnet

# Deploy to Base Mainnet
npm run deploy:mainnet
```

### 2. Frontend

```bash
cd frontend
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local:
#   VITE_WALLETCONNECT_PROJECT_ID=your_id   ← get free at cloud.walletconnect.com
#   VITE_NETWORK=base                       ← or base-sepolia for testnet
#   VITE_CONTRACT_ADDRESS=                  ← optional: pre-deployed address

# Start dev server
npm run dev
# → http://localhost:5173

# Build for production
npm run build
# → dist/ folder, deploy to Vercel/Netlify/Cloudflare Pages
```

---

## Environment Variables

The frontend uses **Vite's built-in env system** — variables in `frontend/.env.local`.

| Variable | Required | Description |
|---|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | ✅ | From [cloud.walletconnect.com](https://cloud.walletconnect.com) (free) |
| `VITE_NETWORK` | ✅ | `base` or `base-sepolia` |
| `VITE_CONTRACT_ADDRESS` | ❌ | Pre-deployed registry address. Leave empty — app auto-deploys. |
| `VITE_RPC_URL` | ❌ | Override RPC. Leave empty for default public Base endpoint. |
| `VITE_APP_NAME` | ❌ | Shown in wallet prompts. Default: `MedVault` |
| `VITE_APP_URL` | ❌ | Your deployed URL. Used in WalletConnect metadata. |

**Vite rule:** Only `VITE_*` variables are bundled into the browser. Variables without the prefix (e.g. `DEPLOYER_PRIVATE_KEY` in the root `.env`) never reach the frontend.

---

## Supported Wallets

| Wallet | Method |
|---|---|
| MetaMask, Rabby, Brave, Frame, OKX, Phantom EVM | EIP-6963 injected (auto-detected) |
| Coinbase Wallet | Coinbase SDK (browser + smart wallet) |
| Rainbow, Trust, Zerion, Argent, 1inch, imToken + 400 more | WalletConnect v2 QR |

---

## Architecture

```
Browser (HTTPS required for crypto.subtle)
  │
  ├── wagmi + viem → Base RPC → MedVaultRegistry.sol
  │     ├── addRecord(bytes32, cid, type, title)
  │     ├── removeRecord(bytes32)
  │     ├── grantAccess(address, bytes32[], expiry)
  │     └── revokeAccess(uint256)
  │
  ├── Web Crypto API (AES-256-GCM)
  │     Key = HKDF(walletSignature, "MedVault v1")
  │     Encrypted blobs → localStorage (swap for Pinata in production)
  │
  └── IPFS CID + keccak256 hash stored on-chain
```

---

## Gas Estimates (Base Mainnet)

| Action | ~Gas | ~Cost (0.1 gwei) |
|---|---|---|
| Deploy registry | ~850,000 | ~$0.08 |
| addRecord | ~120,000 | ~$0.01 |
| grantAccess (1 record) | ~95,000 | ~$0.009 |
| revokeAccess | ~35,000 | ~$0.003 |

---

## License

MIT
