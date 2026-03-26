import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface FileData {
  name: string
  size: number
  data: string // base64
}

interface Props {
  open: boolean
  onClose: () => void
  file: FileData | null
  recordTitle: string
}

function getFileType(name: string): 'pdf' | 'image' | 'text' | 'unknown' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf')                           return 'pdf'
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image'
  if (['txt','csv','json'].includes(ext))      return 'text'
  return 'unknown'
}

function formatSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileViewer({ open, onClose, file, recordTitle }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!file || !open) {
      setObjectUrl(null)
      setTextContent(null)
      return
    }

    setLoading(true)
    try {
      const type = getFileType(file.name)

      // Convert base64 to blob
      const binary = atob(file.data)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      const mimeTypes: Record<string, string> = {
        pdf:  'application/pdf',
        jpg:  'image/jpeg',
        jpeg: 'image/jpeg',
        png:  'image/png',
        gif:  'image/gif',
        webp: 'image/webp',
        txt:  'text/plain',
        csv:  'text/csv',
        json: 'application/json',
      }
      const ext      = file.name.split('.').pop()?.toLowerCase() ?? ''
      const mimeType = mimeTypes[ext] ?? 'application/octet-stream'
      const blob     = new Blob([bytes], { type: mimeType })

      if (type === 'text') {
        blob.text().then(t => {
          setTextContent(t)
          setLoading(false)
        })
      } else {
        const url = URL.createObjectURL(blob)
        setObjectUrl(url)
        setLoading(false)
      }
    } catch (e) {
      console.error('FileViewer error:', e)
      setLoading(false)
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, open])

  const handleDownload = () => {
    if (!file) return
    const link = document.createElement('a')
    link.href     = `data:application/octet-stream;base64,${file.data}`
    link.download = file.name
    link.click()
  }

  const fileType = file ? getFileType(file.name) : 'unknown'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📎 ${recordTitle}`}
      maxWidth={700}
    >
      {!file ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* File info bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.65rem 0.875rem', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--border)',
            flexWrap: 'wrap', gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>
                {{ pdf: '📄', image: '🖼', text: '📝', unknown: '📎' }[fileType]}
              </span>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                  {formatSize(file.size)} · {file.name.split('.').pop()?.toUpperCase()}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              ⬇ Download
            </Button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '3px solid var(--teal)', borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem',
              }} />
              Loading file…
            </div>
          )}

          {/* PDF viewer */}
          {!loading && fileType === 'pdf' && objectUrl && (
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <iframe
                src={objectUrl}
                style={{ width: '100%', height: 500, border: 'none', background: '#fff' }}
                title={file.name}
              />
            </div>
          )}

          {/* Image viewer */}
          {!loading && fileType === 'image' && objectUrl && (
            <div style={{
              borderRadius: 8, overflow: 'hidden',
              border: '1px solid var(--border)',
              background: 'var(--s2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              maxHeight: 500,
            }}>
              <img
                src={objectUrl}
                alt={file.name}
                style={{
                  maxWidth: '100%', maxHeight: 500,
                  objectFit: 'contain', borderRadius: 8,
                }}
              />
            </div>
          )}

          {/* Text viewer */}
          {!loading && fileType === 'text' && textContent && (
            <div style={{
              borderRadius: 8, overflow: 'auto',
              border: '1px solid var(--border)',
              background: 'var(--s2)',
              padding: '1rem', maxHeight: 400,
              fontFamily: 'var(--mono)', fontSize: '0.78rem',
              color: 'var(--text2)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {textContent}
            </div>
          )}

          {/* Unknown file type */}
          {!loading && fileType === 'unknown' && (
            <div style={{
              textAlign: 'center', padding: '2rem',
              border: '1px dashed var(--border)', borderRadius: 8,
              color: 'var(--text3)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📎</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.4rem' }}>
                Preview not available
              </div>
              <div style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                This file type cannot be previewed. Download it to view.
              </div>
              <Button onClick={handleDownload}>⬇ Download {file.name}</Button>
            </div>
          )}

        </div>
      )}
    </Modal>
  )
}