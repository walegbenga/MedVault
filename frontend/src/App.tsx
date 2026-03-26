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
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { targetChain } from '@/lib/wagmi'
import { getContractAddress } from '@/lib/contract'
import type { Address } from 'viem'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

type Role = 'patient' | 'grantee' | null

function AppInner() {
  const { address, isConnected, chain } = useAccount()
  const { switchChain }                 = useSwitchChain()
  const { toast }                       = useToast()
  const { encKey, encSig, error: encError } = useEncryptionKey()
  const reg                             = useRegistry(encKey, encSig)
  const { showWarning, extendSession }  = useSessionTimeout(isConnected)

  const [role,       setRole]       = useState<Role>(null)
  const [recovering, setRecovering] = useState(false)
  const [recovered,  setRecovered]  = useState(false)

  const wrongChain  = isConnected && chain?.id !== targetChain.id
  const needsRole   = isConnected && !wrongChain && !role
  const needsDeploy = isConnected && !wrongChain && role === 'patient' &&
                      !reg.contractAddress && !reg.deploying && !recovering

  // Reset on disconnect
  useEffect(() => {
    if (!address) {
      setRole(null)
      setRecovered(false)
    }
  }, [address])

  // Warn on wrong chain
  useEffect(() => {
    if (wrongChain) toast('warn', `Please switch to ${targetChain.name}.`)
  }, [wrongChain])

  // Auto-recover from chain when localStorage is empty
  useEffect(() => {
    if (
      !address        ||
      !isConnected    ||
      wrongChain      ||
      role !== 'patient' ||
      recovering      ||
      recovered       ||
      reg.records.length > 0 ||
      reg.deploying
    ) return

    const savedContract = getContractAddress(address)
    if (!savedContract) return

    const run = async () => {
      setRecovering(true)
      try {
        toast('inf', 'Recovering your records from chain…')
        await reg.recoverFromChain(savedContract as Address)
        toast('ok', 'Records recovered successfully!')
      } catch (e) {
        console.error('Recovery failed:', e)
        toast('err', 'Recovery failed. Please try again.')
      } finally {
        setRecovering(false)
        setRecovered(true)
      }
    }
    run()
  }, [address, isConnected, wrongChain, role, recovering, recovered, reg])

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
        {/* Logo */}
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem',
          }}>🏥</div>
          Veri<span style={{ color: 'var(--teal)' }}>Health</span>
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

          {/* Recovery indicator */}
          {recovering && (
            <span style={{
              fontSize: '0.72rem', padding: '0.25rem 0.65rem', borderRadius: 20,
              background: 'rgba(255,179,0,0.1)', border: '1px solid rgba(255,179,0,0.25)',
              color: 'var(--amber)', fontFamily: 'var(--mono)',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                border: '2px solid var(--amber)', borderTopColor: 'transparent',
                display: 'inline-block', animation: 'spin 0.7s linear infinite',
              }} />
              Recovering…
            </span>
          )}

          {/* Registry link */}
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
              Registry: {short(reg.contractAddress)} ↗
            </a>
          )}

          {/* Network badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.75rem', borderRadius: 20,
            fontFamily: 'var(--mono)', fontSize: '0.7rem',
            background: 'rgba(0,82,255,0.1)',
            border: '1px solid rgba(0,82,255,0.25)', color: '#6699ff',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--blue)', animation: 'blink 2s ease infinite',
            }} />
            {targetChain.name}
          </div>

          {/* Wrong chain */}
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

      {/* ── Session timeout warning ── */}
      {showWarning && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%',
          transform: 'translateX(-50%)', zIndex: 300,
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '0.875rem 1.25rem', borderRadius: 12,
          background: 'var(--s2)', border: '1px solid rgba(255,179,0,0.4)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxWidth: 420, width: 'calc(100vw - 2rem)',
        }}>
          <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>⏳</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--amber)', marginBottom: '0.2rem' }}>
              Session expiring soon
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
              You'll be disconnected in 5 minutes due to inactivity.
            </div>
          </div>
          <button
            onClick={extendSession}
            style={{
              fontSize: '0.78rem', padding: '0.4rem 0.875rem', borderRadius: 8,
              background: 'rgba(255,179,0,0.1)', color: 'var(--amber)',
              border: '1px solid rgba(255,179,0,0.3)', cursor: 'pointer',
              fontFamily: 'var(--font)', fontWeight: 600, flexShrink: 0,
            }}
          >
            Stay Connected
          </button>
        </div>
      )}

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
            <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Wrong Network
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '1.5rem' }}>
              VeriHealth runs on {targetChain.name}.
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
              How are you using VeriHealth?
            </h2>
            <p style={{
              textAlign: 'center', fontSize: '0.875rem',
              color: 'var(--text2)', marginBottom: '2rem', lineHeight: 1.65,
            }}>
              Choose your role. Click the VeriHealth logo at any time to switch.
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

      {/* ── Recovering ── */}
      {isConnected && !wrongChain && role === 'patient' && recovering && (
        <div style={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⛓</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Recovering Your Records
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text2)', marginBottom: '1.5rem', lineHeight: 1.65 }}>
              Reading your on-chain events to rebuild your record index.
              This may take a moment…
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--teal)',
                  animation: `blink 1.2s ease ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Patient: deploy ── */}
      {isConnected && !wrongChain && role === 'patient' && needsDeploy && !recovering && (
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
      {isConnected && !wrongChain && role === 'patient' && !recovering && (reg.contractAddress || reg.deploying) && (
        <Dashboard encKey={encKey} encSig={encSig} encError={encError} reg={reg} />
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