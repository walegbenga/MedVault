import React, { useEffect } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: number | string
  onOpen?: () => void
}

export function Modal({ open, onClose, title, children, maxWidth = 500, onOpen }: Props) {
  const isMobile = useIsMobile()

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  useEffect(() => {
    if (open && onOpen) onOpen()
  }, [open])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : '1rem',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : maxWidth,
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'var(--s1)',
        border: '1px solid var(--border2)',
        borderRadius: isMobile ? '16px 16px 0 0' : 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        animation: isMobile ? 'slideUp 0.22s ease both' : 'fadeUp 0.18s ease both',
      }}>
        {isMobile && (
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0.75rem auto 0' }} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '1rem 1.25rem 0' : '1.5rem 1.5rem 0' }}>
          <h2 style={{ fontFamily: 'var(--font)', fontSize: '1.1rem', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', minHeight: 'unset', minWidth: 'unset' }}>✕</button>
        </div>
        <div style={{ padding: isMobile ? '1rem 1.25rem 2rem' : '1.25rem 1.5rem 1.5rem' }}>
          {children}
        </div>
      </div>
    </div>
  )
}