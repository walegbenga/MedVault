import React from 'react'

interface Props {
  costEth: string
  costUsd: string | null
  loading: boolean
}

export function GasEstimateTag({ costEth, costUsd, loading }: Props) {
  if (loading) {
    return (
      <span style={{
        fontSize: '0.72rem', color: 'var(--text3)',
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          border: '2px solid var(--text3)', borderTopColor: 'transparent',
          display: 'inline-block', animation: 'spin 0.7s linear infinite',
        }} />
        Estimating gas…
      </span>
    )
  }

  return (
    <span style={{
      fontSize: '0.72rem', color: 'var(--text3)',
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    }}>
      ⛽ ~{costEth} ETH
      {costUsd && (
        <span style={{ color: 'var(--text3)' }}>({costUsd})</span>
      )}
    </span>
  )
}