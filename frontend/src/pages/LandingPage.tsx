import React, { useState } from 'react'
import { WalletButton } from '@/components/WalletConnect'
import { Modal } from '@/components/ui/Modal'
import { targetChain } from '@/lib/wagmi'

export function LandingPage() {
  const [howOpen, setHowOpen] = useState(false)

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '2rem', padding: '4rem 1.5rem' }}>

      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', padding: '0.35rem 1rem', borderRadius: 20, background: 'rgba(0,82,255,0.08)', border: '1px solid rgba(0,82,255,0.22)', color: '#6699ff', letterSpacing: '0.06em' }}>
        ⛓ LIVE ON {targetChain.name.toUpperCase()}
      </span>

      <h1 style={{ fontFamily: 'var(--font)', fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em' }}>
        Own Your<br />
        <span style={{ background: 'linear-gradient(120deg, var(--teal), var(--blue))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Medical Records.
        </span>
      </h1>

      <p style={{ maxWidth: 520, fontSize: '1.05rem', color: 'var(--text2)', lineHeight: 1.75 }}>
        Encrypt your health records on-chain and grant wallet-scoped access to doctors, insurers, or researchers — enforced by a smart contract on {targetChain.name}.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', maxWidth: 760 }}>
        {[
          { icon: '🔐', title: 'Client-side Encryption', desc: 'AES-256-GCM key derived from your wallet signature. Zero server knowledge.' },
          { icon: '📜', title: 'Live Smart Contract',    desc: 'Your personal MedVaultRegistry on Base. Grant/revoke access via real transactions.' },
          { icon: '🌐', title: 'IPFS Storage',           desc: 'Encrypted blobs pinned to IPFS. Only the content hash lives on-chain.' },
          { icon: '🔑', title: 'On-chain Key Exchange',  desc: 'Grantee decryption keys stored directly in the contract. No IPFS mutation needed.' },
        ].map(f => (
          <div key={f.title} style={{ flex: '1 1 170px', maxWidth: 200, textAlign: 'left', padding: '1.1rem 1.25rem', borderRadius: 12, background: 'var(--s1)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{f.icon}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>{f.title}</div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text3)', lineHeight: 1.55 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <WalletButton />
        <button onClick={() => setHowOpen(true)} style={{ fontSize: '0.85rem', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          How does it work?
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
          MetaMask · Coinbase · Rainbow · Trust · Rabby · WalletConnect · any EVM wallet
        </p>
      </div>

      <Modal open={howOpen} onClose={() => setHowOpen(false)} title="🚀 How MedVault Works">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.7 }}>
          {[
            {
              n: 1,
              title: 'Choose your role',
              desc: 'Select Patient (to manage records) or Grantee (to view records shared with you).',
            },
            {
              n: 2,
              title: 'Connect your wallet',
              desc: 'Connect any EVM wallet. Sign a free message to derive your AES-256-GCM encryption key via HKDF. No gas spent.',
            },
            {
              n: 3,
              title: 'Deploy your registry (patients)',
              desc: 'On first use, deploy your personal MedVaultRegistry contract to Base. One-time action — all records and grants live here.',
            },
            {
              n: 4,
              title: 'Upload records',
              desc: 'Records are encrypted in your browser with AES-256-GCM. The encrypted blob is pinned to IPFS. Only the content hash and CID go on-chain via addRecord().',
            },
            {
              n: 5,
              title: 'Grant selective access',
              desc: 'The grantee signs a free message and sends you their signature. You call grantAccess() which encrypts your AES key for them and stores it directly in the contract — no IPFS re-pinning needed.',
            },
            {
              n: 6,
              title: 'Grantee views records',
              desc: 'The grantee enters your contract address. The app fetches their key envelope from the contract, decrypts the AES key using their wallet signature, then decrypts the record content from IPFS.',
            },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, marginTop: 2,
                background: 'rgba(0,229,204,0.12)', border: '1px solid var(--teal)', color: 'var(--teal)',
              }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem', color: 'var(--text)' }}>{s.title}</div>
                <div>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}