import { useEffect, useRef, useCallback, useState } from 'react'
import { useDisconnect } from 'wagmi'

const TIMEOUT_MS  = 30 * 60 * 1000  // 30 minutes idle = auto disconnect
const WARNING_MS  = 5  * 60 * 1000  // warn 5 minutes before timeout
const EVENTS      = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

export function useSessionTimeout(isConnected: boolean) {
  const { disconnect } = useDisconnect()
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showWarning, setShowWarning] = useState(false)

  const clearTimers = useCallback(() => {
    if (timeoutRef.current)  clearTimeout(timeoutRef.current)
    if (warningRef.current)  clearTimeout(warningRef.current)
  }, [])

  const resetTimer = useCallback(() => {
    if (!isConnected) return
    clearTimers()
    setShowWarning(false)

    // Warning timer — fires 5 min before timeout
    warningRef.current = setTimeout(() => {
      setShowWarning(true)
    }, TIMEOUT_MS - WARNING_MS)

    // Disconnect timer
    timeoutRef.current = setTimeout(() => {
      setShowWarning(false)
      disconnect()
    }, TIMEOUT_MS)
  }, [isConnected, clearTimers, disconnect])

  const extendSession = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  // Start timer on connect, clear on disconnect
  useEffect(() => {
    if (isConnected) {
      resetTimer()
    } else {
      clearTimers()
      setShowWarning(false)
    }
    return clearTimers
  }, [isConnected, resetTimer, clearTimers])

  // Reset timer on any user activity
  useEffect(() => {
    if (!isConnected) return
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    return () => EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
  }, [isConnected, resetTimer])

  return { showWarning, extendSession }
}