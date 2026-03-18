import React from 'react'

type Variant = 'primary' | 'outline' | 'danger' | 'success' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  fontFamily: 'var(--font)', fontWeight: 600, borderRadius: 8,
  border: 'none', cursor: 'pointer', transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
}

const VARIANT: Record<Variant, React.CSSProperties> = {
  primary: { background: 'linear-gradient(135deg, var(--teal), var(--blue))', color: '#fff', border: 'none' },
  outline: { background: 'transparent', color: 'var(--teal)', border: '1px solid var(--border2)' },
  danger:  { background: 'rgba(255,68,68,0.1)',  color: 'var(--red)',   border: '1px solid rgba(255,68,68,0.3)' },
  success: { background: 'rgba(0,230,118,0.1)',  color: 'var(--green)', border: '1px solid rgba(0,230,118,0.3)' },
  ghost:   { background: 'transparent', color: 'var(--text2)', border: '1px solid transparent' },
}

const SIZE: Record<Size, React.CSSProperties> = {
  sm: { fontSize: '0.78rem', padding: '0.35rem 0.85rem' },
  md: { fontSize: '0.875rem', padding: '0.5rem 1.2rem' },
  lg: { fontSize: '1rem', padding: '0.7rem 1.75rem' },
}

export function Button({ variant = 'primary', size = 'md', loading, children, style, disabled, ...rest }: Props) {
  return (
    <button
      style={{
        ...BASE, ...VARIANT[variant], ...SIZE[size],
        opacity: (disabled || loading) ? 0.45 : 1,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        ...style,
      }}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          border: '2px solid currentColor', borderTopColor: 'transparent',
          display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  )
}