import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface Props {
  // Patient side — show QR for grantee to scan
  mode: 'show' | 'scan'
  // show mode — display patient contract address as QR
  contractAddress?: string
  // scan mode — grantee scans QR to get contract address
  onScanned?: (address: string) => void
}

// Simple QR code generator using a public API
function QRImage({ data, size = 200 }: { data: string; size?: number }) {
  const encoded = encodeURIComponent(data)
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&bgcolor=ffffff&color=000000&margin=10`}
      alt="QR Code"
      width={size}
      height={size}
      style={{ borderRadius: 8, display: 'block' }}
    />
  )
}

export function QRGrantee({ mode, contractAddress, onScanned }: Props) {
  const { toast }           = useToast()
  const [open, setOpen]     = useState(false)
  const [scanning, setScanning] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const videoRef            = useRef<HTMLVideoElement>(null)
  const streamRef           = useRef<MediaStream | null>(null)

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      setHasCamera(devices.some(d => d.kind === 'videoinput'))
    }).catch(() => setHasCamera(false))
  }, [])

  const startScan = async () => {
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch {
      toast('err', 'Camera access denied.')
      setScanning(false)
    }
  }

  const stopScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const handleClose = () => {
    stopScan()
    setOpen(false)
  }

  // Manual input fallback for scan mode
  const [manualInput, setManualInput] = useState('')
  const handleManualSubmit = () => {
    const val = manualInput.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(val)) {
      toast('warn', 'Invalid contract address.')
      return
    }
    onScanned?.(val)
    handleClose()
  }

  if (mode === 'show') {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          📱 Show QR
        </Button>
        <Modal open={open} onClose={handleClose} title="📱 Share via QR Code" maxWidth={360}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text2)', textAlign: 'center', lineHeight: 1.6 }}>
              Ask the grantee to scan this QR code in VeriHealth to get your registry address.
            </p>
            {contractAddress && (
              <div style={{ background: '#fff', padding: '1rem', borderRadius: 12 }}>
                <QRImage data={`verihealth://registry/${contractAddress}`} size={200} />
              </div>
            )}
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--text3)', wordBreak: 'break-all', textAlign: 'center' }}>
              {contractAddress}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(contractAddress ?? '')
                toast('ok', 'Address copied!')
              }}
            >
              📋 Copy Address
            </Button>
          </div>
        </Modal>
      </>
    )
  }

  // Scan mode
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true) }}>
        📷 Scan QR
      </Button>
      <Modal open={open} onClose={handleClose} title="📷 Scan Patient QR Code" maxWidth={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.6 }}>
            Ask the patient to show their QR code and scan it, or enter the address manually.
          </p>

          {hasCamera && !scanning && (
            <Button onClick={startScan}>📷 Open Camera</Button>
          )}

          {scanning && (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              <video
                ref={videoRef}
                style={{ width: '100%', display: 'block', borderRadius: 8 }}
                playsInline
                muted
              />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  width: 180, height: 180, border: '2px solid var(--teal)',
                  borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                }} />
              </div>
              <Button
                variant="danger" size="sm"
                onClick={stopScan}
                style={{ position: 'absolute', bottom: '0.75rem', left: '50%', transform: 'translateX(-50%)' }}
              >
                Stop
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text3)', fontSize: '0.75rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            or enter manually
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <input
            value={manualInput}
            onChange={e => setManualInput(e.target.value.trim())}
            placeholder="0x…"
            style={{
              width: '100%', padding: '0.55rem 0.875rem', borderRadius: 8,
              fontSize: '0.875rem', background: 'var(--bg)',
              border: '1px solid var(--border2)', color: 'var(--text)',
              fontFamily: 'var(--mono)', boxSizing: 'border-box' as const,
            }}
          />
          <Button onClick={handleManualSubmit} disabled={!manualInput}>
            ✓ Use This Address
          </Button>
        </div>
      </Modal>
    </>
  )
}