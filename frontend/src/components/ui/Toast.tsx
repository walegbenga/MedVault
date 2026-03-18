import React, { createContext, useCallback, useContext, useState } from 'react'

type ToastType = 'ok' | 'err' | 'warn' | 'inf'
interface Toast { id: number; type: ToastType; msg: string }
interface Ctx   { toast: (type: ToastType, msg: string) => void }

const ToastCtx = createContext<Ctx>({ toast: () => {} })
export function useToast() { return useContext(ToastCtx) }

let counter = 0

const BORDER: Record<ToastType, string> = {
  ok: 'var(--green)', err: 'var(--red)', warn: 'var(--amber)', inf: 'var(--teal)',
}
const ICONS: Record<ToastType, string> = { ok: '✅', err: '❌', warn: '⚠️', inf: 'ℹ️' }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((type: ToastType, msg: string) => {
    const id = ++counter
    setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 500, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.65rem',
            padding: '0.8rem 1rem', borderRadius: 10,
            background: 'var(--s2)', border: '1px solid var(--border2)',
            borderLeft: `4px solid ${BORDER[t.type]}`,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            maxWidth: 340, fontSize: '0.875rem',
            animation: 'fadeUp 0.22s ease both',
          }}>
            <span style={{ flexShrink: 0 }}>{ICONS[t.type]}</span>
            <span style={{ color: 'var(--text)' }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}