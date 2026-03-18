import React, { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: number | string
}

export function Modal({ open, onClose, title, children, maxWidth = 500 }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{
        width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--s1)', border: '1px solid var(--border2)',
        borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        animation: 'fadeUp 0.18s ease both',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 1.5rem 0' }}>
          <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.1rem', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--s2)', color: 'var(--text2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
          }}>✕</button>
        </div>
        <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>{children}</div>
      </div>
    </div>
  )
}