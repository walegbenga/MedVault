import React, { useState } from 'react'
import { useConnect, useAccount, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { targetChain } from '@/lib/wagmi'

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const wrongChain = isConnected && chain?.id !== targetChain.id

  if (isConnected && address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {wrongChain && (
          <span style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: 8, background: 'rgba(255,179,0,0.1)', color: 'var(--amber)', border: '1px solid rgba(255,179,0,0.3)' }}>
            Wrong Network
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.85rem', borderRadius: 10, background: 'var(--s1)', border: '1px solid var(--border)' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>
            {address.slice(2, 4).toUpperCase()}
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--text2)' }}>
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => disconnect()}>Disconnect</Button>
      </div>
    )
  }

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>Connect Wallet</Button>
      <WalletPickerModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function WalletPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connectors, connect, isPending } = useConnect()
  const { toast } = useToast()

  const handleConnect = (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId)
    if (!connector) return
    connect(
      { connector, chainId: targetChain.id },
      {
        onSuccess: () => { toast('ok', 'Wallet connected!'); onClose() },
        onError: e => toast('err', e.message ?? 'Connection failed'),
      }
    )
  }

  const injected = connectors.filter(c => c.type === 'injected')
  const wc       = connectors.find(c => c.type === 'walletConnect')
  const cb       = connectors.find(c => c.type === 'coinbaseWallet')

  return (
    <Modal open={open} onClose={onClose} title="Connect Your Wallet">
      <p style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
        Choose any EVM wallet. All EIP-6963 injected wallets and WalletConnect v2 are supported.
      </p>

      {injected.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {injected.map(c => (
            <WalletOption key={c.uid} name={c.name}
              icon={typeof c.icon === 'string' ? c.icon : undefined}
              badge="Detected" badgeColor="green"
              loading={isPending} onClick={() => handleConnect(c.id)} />
          ))}
        </div>
      )}

      {injected.length === 0 && (
        <div style={{ fontSize: '0.82rem', textAlign: 'center', padding: '0.875rem', marginBottom: '0.75rem', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No wallet extension detected.{' '}
          <a href="https://metamask.io" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>Install MetaMask</a>
          {' '}or use WalletConnect below.
        </div>
      )}

      {(wc || cb) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.75rem 0', fontSize: '0.75rem', color: 'var(--text3)' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          or connect with
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {cb && <WalletOption name="Coinbase Wallet" icon="🔵" badge="Browser & Mobile" badgeColor="blue" loading={isPending} onClick={() => handleConnect(cb.id)} />}
        {wc && <WalletOption name="WalletConnect"   icon="🔗" badge="QR / Mobile"      badgeColor="blue" loading={isPending} onClick={() => handleConnect(wc.id)} />}
      </div>

      <p style={{ fontSize: '0.72rem', marginTop: '1.25rem', textAlign: 'center', color: 'var(--text3)', lineHeight: 1.6 }}>
        Connecting will ask you to sign a message to derive your encryption key. No gas is spent.
      </p>
    </Modal>
  )
}

function WalletOption({ name, icon, badge, badgeColor, loading, onClick }: {
  name: string; icon?: string; badge: string
  badgeColor: 'green' | 'blue'; loading: boolean; onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const badgeStyle: React.CSSProperties = badgeColor === 'green'
    ? { background: 'rgba(0,230,118,0.1)', color: 'var(--green)', border: '1px solid rgba(0,230,118,0.25)' }
    : { background: 'rgba(0,82,255,0.1)',  color: '#6699ff',       border: '1px solid rgba(0,82,255,0.25)' }

  return (
    <button onClick={onClick} disabled={loading}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        width: '100%', padding: '0.75rem 1rem', borderRadius: 11,
        background: hover ? 'var(--s3)' : 'var(--s2)',
        border: `1px solid ${hover ? 'var(--border2)' : 'var(--border)'}`,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.45 : 1, textAlign: 'left', transition: 'all 0.15s',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--s3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon?.startsWith('data:')
          ? <img src={icon} alt={name} style={{ width: 24, height: 24, borderRadius: 5 }} />
          : <span style={{ fontSize: '1.1rem' }}>{icon ?? '💼'}</span>
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{name}</div>
      </div>
      <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: 5, flexShrink: 0, ...badgeStyle }}>{badge}</span>
    </button>
  )
}