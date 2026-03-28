import { useEffect, useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { type Address } from 'viem'
import { CONTRACT_ABI } from '@/lib/contract'

interface Notification {
  id: string
  type: 'grant' | 'revoke' | 'emergency' | 'delegate'
  title: string
  body: string
  ts: number
  read: boolean
  txHash?: string
}

const STORAGE_KEY = (address: string) => `verihealth_notifications_${address.toLowerCase()}`

function loadNotifications(address: string): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(address)) ?? '[]')
  } catch { return [] }
}

function saveNotifications(address: string, notifications: Notification[]) {
  localStorage.setItem(STORAGE_KEY(address), JSON.stringify(notifications))
}

export function useNotifications(
  address: string | undefined,
  contractAddress: Address | null
) {
  const publicClient = usePublicClient()
  const [notifications, setNotifications] = useState<Notification[]>(
    () => address ? loadNotifications(address) : []
  )
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )

  const unreadCount = notifications.filter(n => !n.read).length

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  const sendBrowserNotification = useCallback((title: string, body: string) => {
    if (permission !== 'granted') return
    if (typeof Notification === 'undefined') return
    try {
      new Notification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
      })
    } catch { /* browser may block */ }
  }, [permission])

  const addNotification = useCallback((
    type: Notification['type'],
    title: string,
    body: string,
    txHash?: string
  ) => {
    if (!address) return
    const n: Notification = {
      id:     `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type, title, body, txHash,
      ts:     Date.now(),
      read:   false,
    }
    setNotifications(prev => {
      const next = [n, ...prev].slice(0, 50) // keep last 50
      saveNotifications(address, next)
      return next
    })
    sendBrowserNotification(title, body)
  }, [address, sendBrowserNotification])

  const markAllRead = useCallback(() => {
    if (!address) return
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }))
      saveNotifications(address, next)
      return next
    })
  }, [address])

  const markRead = useCallback((id: string) => {
    if (!address) return
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true } : n)
      saveNotifications(address, next)
      return next
    })
  }, [address])

  const clearAll = useCallback(() => {
    if (!address) return
    setNotifications([])
    localStorage.removeItem(STORAGE_KEY(address))
  }, [address])

  // Poll for on-chain events every 30 seconds
  useEffect(() => {
    if (!address || !contractAddress || !publicClient) return

    const poll = async () => {
      try {
        // Check for AccessGranted events targeting this address
        const grantLogs = await publicClient.getLogs({
          address: contractAddress,
          event: {
            type: 'event',
            name: 'AccessGranted',
            inputs: [
              { indexed: true,  name: 'grantId',   type: 'uint256'   },
              { indexed: true,  name: 'grantee',   type: 'address'   },
              { indexed: false, name: 'recordIds', type: 'bytes32[]' },
              { indexed: false, name: 'expiresAt', type: 'uint256'   },
            ],
          },
          args: { grantee: address as Address },
          fromBlock: BigInt(Math.floor(Date.now() / 1000) - 60), // last ~60 blocks
          toBlock: 'latest',
        })

        for (const log of grantLogs) {
          const txHash = log.transactionHash ?? undefined
          const existing = notifications.find(n => n.txHash === txHash)
          if (!existing) {
            addNotification(
              'grant',
              '🔑 New Access Granted',
              `A patient has granted you access to their health records.`,
              txHash
            )
          }
        }

        // Check for EmergencyActivated events
        const emergencyLogs = await publicClient.getLogs({
          address: contractAddress,
          event: {
            type: 'event',
            name: 'EmergencyActivated',
            inputs: [
              { indexed: true,  name: 'activatedBy', type: 'address' },
              { indexed: false, name: 'timestamp',   type: 'uint256' },
            ],
          },
          fromBlock: BigInt(Math.floor(Date.now() / 1000) - 60),
          toBlock: 'latest',
        })

        for (const log of emergencyLogs) {
          const txHash   = log.transactionHash ?? undefined
          const existing = notifications.find(n => n.txHash === txHash)
          if (!existing) {
            addNotification(
              'emergency',
              '🚨 Emergency Access Activated',
              'Emergency access has been activated on your registry.',
              txHash
            )
          }
        }
      } catch { /* polling is best-effort */ }
    }

    poll()
    const interval = setInterval(poll, 30_000)
    return () => clearInterval(interval)
  }, [address, contractAddress, publicClient])

  return {
    notifications,
    unreadCount,
    permission,
    requestPermission,
    addNotification,
    markRead,
    markAllRead,
    clearAll,
  }
}