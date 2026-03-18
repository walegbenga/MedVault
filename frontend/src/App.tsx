import React, { useEffect, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { WalletButton } from '@/components/WalletConnect'
import { DeployScreen } from '@/components/DeployScreen'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { LandingPage } from '@/pages/LandingPage'
import { Dashboard } from '@/pages/Dashboard'
import { GranteeView } from '@/pages/GranteeView'
import { useEncryptionKey } from '@/hooks/useEncryptionKey'
import { useRegistry } from '@/hooks/useRegistry'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

type Role = 'patient' | 'grantee' | null

function AppInner() {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { toast } = useToast()
  const { encKey, encSig, error: encError } = useEncryptionKey()
  const reg = useRegistry(encKey, encSig)

  const [role, setRole] = useState<Role>(null)

  const wrongChain  = isConnected && chain?.id !== targetChain.id
  const needsRole   = isConnected && !wrongChain && !role
  const needsDeploy = isConnected && !wrongChain && role === 'patient' && !reg.contractAddress && !reg.deploying

  useEffect(() => { if (!address) setRole(null) }, [address])
  useEffect(() => {
    if (wrongChain) toast('warn', `Please switch to ${targetChain.name}.`)
  }, [wrongChain])

  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-4)}`

  return (
    <div>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 90, height: 64,
        background: 'rgba(3,8,13,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem', gap: '1rem',
      }}>
        {/* Logo — click to switch role */}
        <div
          onClick={() => { if (role) setRole(null) }}
          style={{
            fontFamily: 'var(--font)', fontSize: '1.2rem', fontWeight: 800,
            letterSpacing: '-0.03em', display: 'flex', alignItems: 'center',
            gap: '0.5rem', cursor: role ? 'pointer' : 'default',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--teal), var(--blue))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
          }}>🏥</div>
          Med<span style={{ color: 'var(--teal)' }}>Vault</span>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>

          {/* Role badge */}
          {role && (
            <span style={{
              fontSize: '0.72rem', padding: '0.25rem 0.65rem', borderRadius: 20,
              background: role === 'patient' ? 'rgba(0,229,204,0.1)' : 'rgba(0,82,255,0.1)',
              border: `1px solid ${role === 'patient' ? 'rgba(0,229,204,0.25)' : 'rgba(0,82,255,0.25)'}`,
              color: role === 'patient' ? 'var(--teal)' : '#6699ff',
              fontFamily: 'var(--mono)',
            }}>
              {role === 'patient' ? '🏥 Patient' : '👁 Grantee'}
            </span>
          )}

          {/* Registry link — patients only */}
          {role === 'patient' && reg.contractAddress && (
  
    <a href={`${EXPLORER}/address/${reg.contractAddress}`}
    target="_blank" rel="noreferrer"
    style={{
      fontFamily: 'var(--mono)', fontSize: '0.72rem',
      padding: '0.3rem 0.75rem', borderRadius: 9,
      background: 'var(--s1)', border: '1px solid var(--border)',
      color: 'var(--teal)', textDecoration: 'none',
    }}
  >
    Registry: {reg.contractAddress.slice(0, 8)}…{reg.contractAddress.slice(-4)} ↗
  </a>
)}

          {/* Network badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.75rem', borderRadius: 20,
            fontFamily: 'var(--mono)', fontSize: '0.7rem',
            background: 'rgba(0,82,255,0.1)', border: '1px solid rgba(0,82,255,0.25)', color: '#6699ff',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--blue)', animation: 'blink 2s ease infinite',
            }} />
            {targetChain.name}
          </div>

          {/* Wrong chain button */}
          {wrongChain && (
            <button
              onClick={() => switchChain({ chainId: targetChain.id })}
              style={{
                fontSize: '0.78rem', padding: '0.35rem 0.85rem', borderRadius: 8,
                background: 'rgba(255,179,0,0.1)', color: 'var(--amber)',
                border: '1px solid rgba(255,179,0,0.3)', cursor: 'pointer',
                fontFamily: 'var(--font)', fontWeight: 600,
              }}
            >
              Switch to {targetChain.name}
            </button>
          )}

          <WalletButton />
        </div>
      </header>

      {/* ── Not connected ── */}
      {!isConnected && <LandingPage />}

      {/* ── Wrong chain ── */}
      {isConnected && wrongChain && (
        <div style={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⛓</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Wrong Network</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '1.5rem' }}>
              MedVault runs on {targetChain.name}.
            </p>
            <button
              onClick={() => switchChain({ chainId: targetChain.id })}
              style={{
                padding: '0.65rem 1.75rem', borderRadius: 8,
                background: 'linear-gradient(135deg, var(--teal), var(--blue))',
                color: '#fff', border: 'none', fontFamily: 'var(--font)',
                fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
              }}
            >
              Switch to {targetChain.name}
            </button>
          </div>
        </div>
      )}

      {/* ── Role selection ── */}
      {isConnected && !wrongChain && needsRole && (
        <div style={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem 1rem',
        }}>
          <div style={{ width: '100%', maxWidth: 520 }}>
            <h2 style={{
              fontFamily: 'var(--font)', fontSize: '1.6rem', fontWeight: 800,
              textAlign: 'center', marginBottom: '0.5rem',
            }}>
              How are you using MedVault?
            </h2>
            <p style={{
              textAlign: 'center', fontSize: '0.875rem',
              color: 'var(--text2)', marginBottom: '2rem', lineHeight: 1.65,
            }}>
              Choose your role. Click the MedVault logo at any time to switch.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                {
                  role: 'patient' as Role,
                  icon: '🏥',
                  label: "I'm a Patient",
                  color: 'var(--teal)',
                  hoverBorder: 'var(--teal)',
                  desc: 'Upload and manage my own health records. Deploy my personal registry. Grant access to doctors or insurers.',
                },
                {
                  role: 'grantee' as Role,
                  icon: '👁',
                  label: "I'm a Grantee",
                  color: '#6699ff',
                  hoverBorder: '#6699ff',
                  desc: 'A patient has shared their records with my wallet. I want to view the records granted to me.',
                },
              ].map(opt => (
                <button
                  key={opt.role!}
                  onClick={() => setRole(opt.role)}
                  style={{
                    background: 'var(--s1)', border: '1px solid var(--border2)',
                    borderRadius: 14, padding: '1.75rem 1.25rem',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = opt.hoverBorder
                    el.style.background  = 'var(--s2)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--border2)'
                    el.style.background  = 'var(--s1)'
                  }}
                >
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{opt.icon}</div>
                  <div style={{
                    fontFamily: 'var(--font)', fontSize: '1rem', fontWeight: 700,
                    marginBottom: '0.4rem', color: opt.color,
                  }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.6 }}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Patient: deploy ── */}
      {isConnected && !wrongChain && role === 'patient' && needsDeploy && (
        <DeployScreen
          deploying={reg.deploying}
          deployStep={reg.deployStep}
          onDeploy={async () => {
            try {
              await reg.deployRegistry()
              toast('ok', `Registry deployed on ${targetChain.name}!`)
            } catch (e: unknown) {
              toast('err', e instanceof Error ? e.message : 'Deploy failed')
            }
          }}
        />
      )}

      {/* ── Patient: dashboard ── */}
      {isConnected && !wrongChain && role === 'patient' && (reg.contractAddress || reg.deploying) && (
        <Dashboard encKey={encKey} encSig={encSig} encError={encError} />
      )}

      {/* ── Grantee view ── */}
      {isConnected && !wrongChain && role === 'grantee' && (
        <GranteeView />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}