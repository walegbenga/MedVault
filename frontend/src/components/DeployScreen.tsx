import React, { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { targetChain } from '@/lib/wagmi'
import { useGasEstimate } from '@/hooks/useGasEstimate'
import { GasEstimateTag } from '@/components/ui/GasEstimateTag'

interface Props {
  deploying: boolean
  deployStep: number
  onDeploy: () => void
  error?: string | null
}

const STEPS = [
  'Preparing contract bytecode',
  'Waiting for wallet signature',
  'Broadcasting to network',
  'Waiting for block confirmation',
]

export function DeployScreen({ deploying, deployStep, onDeploy, error }: Props) {
  const gas = useGasEstimate(null)

  useEffect(() => {
    gas.estimateDeploy()
  }, [])

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 18, padding: '2rem' }}>

        <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          📦 Deploy Your VeriHealth Registry
        </h2>

        <p style={{ fontSize: '0.875rem', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '0.75rem' }}>
          Your personal <strong>VeriHealthRegistry</strong> contract needs to be deployed to{' '}
          <strong>{targetChain.name}</strong>. This is a one-time action — all your records,
          access grants, and encrypted key envelopes live here permanently.
        </p>

        <div style={{
          fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.6,
          padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1.5rem',
          background: 'rgba(0,229,204,0.05)', border: '1px solid rgba(0,229,204,0.18)',
        }}>
          🔑 Grantee decryption keys are stored directly in your contract —
          no third-party database required.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
          {STEPS.map((label, i) => {
            const n        = i + 1
            const isDone   = deployStep > n
            const isActive = deployStep === n
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.65rem 0.875rem', borderRadius: 9,
                background: 'var(--s2)',
                border: `1px solid ${isActive ? 'var(--teal)' : 'var(--border)'}`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 700,
                  background: isDone ? 'rgba(0,230,118,0.12)' : isActive ? 'rgba(0,229,204,0.12)' : 'var(--s3)',
                  border: `1px solid ${isDone ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--border2)'}`,
                  color: isDone ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--text3)',
                }}>
                  {isDone ? '✓' : n}
                </div>
                <span style={{
                  fontSize: '0.875rem', flex: 1,
                  color: isDone ? 'var(--text3)' : isActive ? 'var(--text)' : 'var(--text2)',
                }}>
                  {label}
                </span>
                {isActive && (
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid var(--teal)', borderTopColor: 'transparent',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0,
                  }} />
                )}
              </div>
            )
          })}
        </div>

        <div style={{ height: 4, borderRadius: 4, background: 'var(--s3)', overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg, var(--teal), var(--blue))',
            width: `${(deployStep / STEPS.length) * 100}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {error && (
          <div style={{
            fontSize: '0.875rem', padding: '0.75rem 1rem', borderRadius: 9,
            marginBottom: '1rem', background: 'rgba(255,68,68,0.06)',
            border: '1px solid rgba(255,68,68,0.2)', color: '#ff9999',
          }}>
            ❌ {error}
          </div>
        )}

        {!deploying && (
          <Button
            onClick={onDeploy}
            loading={deploying}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            🚀 Deploy Registry to {targetChain.name}
          </Button>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '0.5rem', marginTop: '0.875rem',
          fontSize: '0.72rem', color: 'var(--text3)',
        }}>
          {gas.estimates.deploy ? (
            <>
              Estimated cost:{' '}
              <GasEstimateTag
                costEth={gas.estimates.deploy.costEth}
                costUsd={gas.estimates.deploy.costUsd}
                loading={gas.loading.deploy ?? false}
              />
              {' '}· One-time only
            </>
          ) : (
            'Small gas fee required · One-time only'
          )}
        </div>

      </div>
    </div>
  )
}