import React from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%', borderRadius: 8, padding: '0.55rem 0.875rem',
  fontSize: '0.875rem', outline: 'none',
  background: 'var(--bg)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--font)',
  transition: 'border-color 0.18s', boxSizing: 'border-box',
}

export function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
      <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text2)' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: '0.72rem', color: 'var(--text3)', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={inputStyle}
      onFocus={e => { e.target.style.borderColor = 'var(--teal)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,204,0.07)' }}
      onBlur={e =>  { e.target.style.borderColor = 'var(--border2)'; e.target.style.boxShadow = 'none' }}
      {...props}
    />
  )
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      style={{ ...inputStyle, appearance: 'none' }}
      onFocus={e => { e.target.style.borderColor = 'var(--teal)' }}
      onBlur={e =>  { e.target.style.borderColor = 'var(--border2)' }}
      {...props}
    >{children}</select>
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
      onFocus={e => { e.target.style.borderColor = 'var(--teal)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,204,0.07)' }}
      onBlur={e =>  { e.target.style.borderColor = 'var(--border2)'; e.target.style.boxShadow = 'none' }}
      {...props}
    />
  )
}