import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { targetChain } from '@/lib/wagmi'

const EXPLORER = targetChain.blockExplorers?.default.url ?? 'https://basescan.org'

interface Notification {
  id: string
  type: 'grant' | 'revoke' | 'emergency' | 'delegate'
  title: string
  body: string
  ts: number
  read: boolean
  txHash?: string
}

interface Props {
  notifications: Notification[]
  unreadCount: number
  permission: NotificationPermission
  onRequestPermission: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
}

const TYPE_ICONS: Record<string, string> = {
  grant: '🔑', revoke: '🚫', emergency: '🚨', delegate: '🩺',
}

export function NotificationBell({
  notifications, unreadCount, permission,
  onRequestPermission, onMarkRead, onMarkAllRead, onClearAll,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(p => !p); if (unreadCount > 0) onMarkAllRead() }}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: 9,
          background: 'var(--s1)', border: '1px solid var(--border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '1rem',
          minHeight: 'unset', minWidth: 'unset',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--red)', color: '#fff',
            fontSize: '0.6rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 150 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: 44, right: 0, zIndex: 200,
            width: 340, maxHeight: 480, overflowY: 'auto',
            background: 'var(--s1)', border: '1px solid var(--border2)',
            borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)',
              position: 'sticky', top: 0, background: 'var(--s1)', zIndex: 1,
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                Notifications {unreadCount > 0 && <span style={{ color: 'var(--teal)', fontSize: '0.75rem' }}>({unreadCount} new)</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {notifications.length > 0 && (
                  <button onClick={onClearAll} style={{ fontSize: '0.72rem', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem' }}>
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Permission prompt */}
            {permission === 'default' && (
              <div style={{
                padding: '0.75rem 1rem', background: 'rgba(0,229,204,0.05)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
                  Enable browser notifications?
                </span>
                <Button size="sm" onClick={onRequestPermission}>Enable</Button>
              </div>
            )}

            {/* Notifications list */}
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => onMarkRead(n.id)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    background: n.read ? 'transparent' : 'rgba(0,229,204,0.03)',
                    cursor: 'default',
                    display: 'flex', gap: '0.65rem', alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 2 }}>
                    {TYPE_ICONS[n.type] ?? '📋'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: n.read ? 400 : 600, marginBottom: '0.2rem' }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '0.25rem' }}>
                      {n.body}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
                        {new Date(n.ts).toLocaleString()}
                      </span>
                      {n.txHash && (
                        
                          <a href={`${EXPLORER}/tx/${n.txHash}`}
                          target="_blank" rel="noreferrer"
                          style={{ fontSize: '0.68rem', color: 'var(--teal)', textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}
                        >
                          View tx ↗
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.read && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}