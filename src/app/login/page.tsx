'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push('/setup')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push('/admin')
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col lg:flex-row">
      {/* ── Left hero panel ── */}
      <div
        className="relative flex flex-col justify-between overflow-hidden
                   lg:w-[52%] lg:min-h-screen
                   px-8 py-10 lg:px-16 lg:py-14"
        style={{
          background: 'linear-gradient(135deg, #00B894 0%, #0ABDE3 100%)',
        }}
      >
        {/* Animated gradient orbs */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div
            className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)',
              animation: 'pulse 6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-15"
            style={{
              background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)',
              animation: 'pulse 8s ease-in-out infinite 2s',
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10"
            style={{
              background: 'radial-gradient(circle, #ffffff 0%, transparent 60%)',
              animation: 'pulse 10s ease-in-out infinite 1s',
            }}
          />
        </div>

        {/* Branding */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white/90 text-3xl">📷</span>
            <h1 className="text-4xl font-extrabold tracking-tight text-white">
              TIKTIK
            </h1>
          </div>
          <p className="text-white/80 text-sm font-medium uppercase tracking-widest">
            Attendance, verified.
          </p>
        </div>

        {/* Center copy — hidden on mobile compact header */}
        <div className="relative z-10 hidden lg:block">
          <h2 className="text-white text-3xl font-bold leading-snug mb-4 max-w-xs">
            Camera-verified attendance for modern daycares
          </h2>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            Replace paper sign-in sheets with a photo-confirmed clock-in
            system that parents trust and regulators love.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              { icon: '📸', text: 'Photo-verified clock events' },
              { icon: '📊', text: 'One-click payroll exports' },
              { icon: '🔒', text: 'Secure, private, local-first' },
            ].map(({ icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-lg flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  {icon}
                </span>
                <span className="text-white font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom trust line */}
        <p className="relative z-10 hidden lg:block text-white/50 text-xs">
          Trusted by daycare operators across Canada
        </p>

        {/* Keyframe styles injected inline for zero extra dependencies */}
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.15; }
            50% { transform: scale(1.12); opacity: 0.25; }
          }
        `}</style>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 lg:py-0">
        <div className="w-full max-w-sm">
          {/* Mobile-only compact brand strip */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-extrabold">
              <span className="text-[#00B894]">TIK</span>
              <span className="text-[#2D3436]">TIK</span>
            </h1>
            <p className="text-[#636E72] text-sm mt-1">
              Camera-verified attendance for modern daycares
            </p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#2D3436]">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-[#636E72] text-sm mt-1">
              {isSignUp
                ? 'Set up your daycare in under 2 minutes.'
                : 'Sign in to your dashboard.'}
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-[#E9EEF2] shadow-sm p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="group">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-[#636E72] uppercase tracking-wider mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="director@daycare.com"
                  className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm text-[#2D3436]
                             placeholder:text-[#B2BEC3]
                             focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]
                             transition-all duration-200"
                />
              </div>

              {/* Password */}
              <div className="group">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-[#636E72] uppercase tracking-wider mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm text-[#2D3436]
                             placeholder:text-[#B2BEC3]
                             focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]
                             transition-all duration-200"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 bg-[#FF6B6B]/8 border border-[#FF6B6B]/20 text-[#E55039] px-4 py-3 rounded-xl text-sm">
                  <span className="mt-0.5 flex-shrink-0">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-3.5 rounded-xl font-semibold text-sm text-white
                           transition-all duration-200 overflow-hidden
                           disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: loading
                    ? '#00B894'
                    : 'linear-gradient(135deg, #00B894 0%, #00C9A7 100%)',
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(0,184,148,0.35)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.75s linear infinite' }}
                    />
                    {isSignUp ? 'Creating account…' : 'Signing in…'}
                  </span>
                ) : isSignUp ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </button>

              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
              `}</style>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[#E9EEF2]" />
              <span className="text-xs text-[#B2BEC3]">or</span>
              <div className="flex-1 h-px bg-[#E9EEF2]" />
            </div>

            {/* Toggle sign-up / sign-in */}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
              className="w-full py-3 rounded-xl border border-[#E9EEF2] text-sm font-medium
                         text-[#00B894] hover:bg-[#F0FBF8] hover:border-[#00B894]/30
                         transition-all duration-200"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-[#B2BEC3] mt-6">
            Trusted by daycare operators across Canada &nbsp;·&nbsp; Because the camera doesn&apos;t lie.
          </p>
        </div>
      </div>
    </div>
  )
}
