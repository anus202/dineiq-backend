import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldWrapperProps {
  label: string
  error?: string | null
  hint?: ReactNode
  children: ReactNode
}

function FieldWrapper({ label, error, hint, children }: FieldWrapperProps) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: ReactNode }

export function TextField({ label, error, hint, className = '', ...rest }: InputProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <input className={`field-input ${error ? 'border-rose-400' : ''} ${className}`} {...rest} />
    </FieldWrapper>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string | null; hint?: ReactNode }

export function SelectField({ label, error, hint, children, className = '', ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <select className={`field-input ${error ? 'border-rose-400' : ''} ${className}`} {...rest}>
        {children}
      </select>
    </FieldWrapper>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string | null; hint?: ReactNode }

export function TextAreaField({ label, error, hint, className = '', ...rest }: TextAreaProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <textarea className={`field-input ${className}`} rows={3} {...rest} />
    </FieldWrapper>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200"
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}
