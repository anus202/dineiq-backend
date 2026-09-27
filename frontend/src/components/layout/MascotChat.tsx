import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { assistantApi } from '../../services/endpoints'
import type { AssistantMessage } from '../../types/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const QUICK_PROMPTS = ['What is this page for?', 'How do I get started here?', 'What do these numbers mean?']

/** A short, friendly label for the current route, purely for the assistant's own
 * greeting line -- the real per-page context (used to scope its actual answers) lives
 * server-side in assistant_service.PAGE_CONTEXT, which this deliberately doesn't
 * duplicate in full. */
function pageLabel(pathname: string): string {
  if (pathname === '/login') return 'the login page'
  if (pathname === '/register') return 'the sign-up page'
  if (pathname.startsWith('/inventory')) return 'the inventory section'
  if (pathname.startsWith('/pos')) return 'the POS screen'
  if (pathname.startsWith('/admin')) return 'this admin page'
  if (pathname.startsWith('/customer')) return 'your rewards page'
  if (pathname.startsWith('/ml-insights')) return 'this ML insights page'
  if (pathname.startsWith('/dashboard')) return 'this dashboard'
  return 'this page'
}

/** Floating "3D toy" mascot badge -- a radial-gradient sphere with a soft inner
 * highlight and drop shadow standing in for a real 3D model, plus a gentle bob/rotate
 * so it reads as alive. Mounted once at the app root (see App.tsx) so it persists,
 * unclosed, across every route including /login and /register. */
export function MascotChat() {
  const location = useLocation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unconfigured, setUnconfigured] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', text: `Hi! I'm your DineIQ assistant 👋 Ask me anything about ${pageLabel(location.pathname)}.` }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    const history: AssistantMessage[] = messages.slice(-10).map((m) => ({ Role: m.role, Text: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setSending(true)
    try {
      const res = await assistantApi.chat({ Message: trimmed, Page: location.pathname, History: history, UserRole: user?.Role ?? null })
      setUnconfigured(!res.Configured)
      setMessages((prev) => [...prev, { role: 'assistant', text: res.Reply }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: "Sorry, I couldn't reach the server just now. Please try again." }])
    } finally {
      setSending(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="DineIQ Assistant"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed right-5 bottom-24 z-50 flex h-[min(520px,70vh)] w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-3 text-white">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg shadow-inner"
                style={{ background: 'radial-gradient(circle at 35% 25%, #fefefe, #5eead4 55%, #0d9488 100%)' }}
              >
                🐼
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold">DineIQ Assistant</p>
                <p className="flex items-center gap-1 text-[10.5px] text-teal-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Online
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-lg p-1 text-white/80 hover:bg-white/15 hover:text-white">
                ✕
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50 px-3.5 py-3.5 dark:bg-slate-950">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto rounded-br-sm bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                      : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {sending && (
                <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                </div>
              )}
              {messages.length <= 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void send(q)}
                      className="rounded-full border border-brand-100 bg-white px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-900 dark:bg-slate-800 dark:text-brand-300 dark:hover:bg-slate-800/70"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {unconfigured && (
                <p className="pt-1 text-center text-[10.5px] text-amber-600 dark:text-amber-400">AI assistant isn't configured on this server yet.</p>
              )}
            </div>

            <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="field-input flex-1 py-2 text-[12.5px]"
                aria-label="Message the assistant"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                ➤
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close DineIQ Assistant' : 'Open DineIQ Assistant'}
        aria-expanded={open}
        className="fixed right-5 bottom-5 z-50 flex h-16 w-16 items-center justify-center rounded-full text-[30px] shadow-[0_14px_28px_-8px_rgba(15,23,42,0.4)]"
        style={{ background: 'radial-gradient(circle at 35% 25%, #fefefe, #14b8a6 55%, #0d9488 100%)' }}
        animate={{ y: [0, -9, 0], rotate: [0, -4, 4, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
      >
        🐼
        {!open && messages.length === 0 && <span className="absolute top-1 right-1.5 h-3 w-3 rounded-full border-2 border-white bg-rose-500" aria-hidden />}
      </motion.button>
    </>
  )
}
