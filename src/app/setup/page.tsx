'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Derive a URL-friendly slug from the center name for the preview
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function SetupPage() {
  const router = useRouter()
  const [centerName, setCenterName] = useState('')
  const [directorName, setDirectorName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setEmail(user.email || '')

      // Check if center already exists
      fetch('/api/center').then(res => res.json()).then(data => {
        if (data && !data.error) {
          router.push('/admin')
          return
        }
        setCheckingAuth(false)
      })
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: centerName,
          director_name: directorName,
          email,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }
      router.push('/admin')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-4 border-[#00B894]/20 border-t-[#00B894]"
            style={{ animation: 'spin 0.75s linear infinite' }}
          />
          <p className="text-[#636E72] text-sm">Checking your account…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  const slugPreview = centerName ? toSlug(centerName) : 'your-center-name'
  const isReady = centerName.trim().length > 0 && directorName.trim().length > 0

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col items-center justify-center p-4 py-12">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white"
          style={{ background: '#00B894' }}
        >
          1
        </span>
        <span className="text-xs font-medium text-[#636E72]">Step 1 of 1</span>
        <div className="w-16 h-1 rounded-full bg-[#00B894] ml-1" />
      </div>

      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #00B894, #0ABDE3)' }}
          >
            <span className="text-3xl">🏫</span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#2D3436] leading-tight">
            Set up your center
          </h1>
          <p className="text-[#636E72] mt-2 text-sm leading-relaxed max-w-sm mx-auto">
            You&apos;re one step away from camera-verified attendance.
            This takes about 60 seconds.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E9EEF2] shadow-sm overflow-hidden">
          {/* Card header band */}
          <div
            className="px-8 py-4 border-b border-[#E9EEF2]"
            style={{ background: 'linear-gradient(90deg, #F0FBF8, #F8FFFE)' }}
          >
            <p className="text-xs font-semibold text-[#00B894] uppercase tracking-widest">
              Center Details
            </p>
            <p className="text-[#636E72] text-xs mt-0.5">
              These details appear on your staff clock-in screen and all reports.
            </p>
          </div>

          <div className="px-8 py-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Center Name */}
              <div>
                <label
                  htmlFor="centerName"
                  className="block text-xs font-semibold text-[#636E72] uppercase tracking-wider mb-1.5"
                >
                  Center Name
                </label>
                <input
                  id="centerName"
                  type="text"
                  value={centerName}
                  onChange={e => setCenterName(e.target.value)}
                  required
                  placeholder="Little Picasso Halifax"
                  className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm text-[#2D3436]
                             placeholder:text-[#B2BEC3]
                             focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]
                             transition-all duration-200"
                />
              </div>

              {/* Director Name */}
              <div>
                <label
                  htmlFor="directorName"
                  className="block text-xs font-semibold text-[#636E72] uppercase tracking-wider mb-1.5"
                >
                  Director Name
                </label>
                <input
                  id="directorName"
                  type="text"
                  value={directorName}
                  onChange={e => setDirectorName(e.target.value)}
                  required
                  placeholder="Your full name"
                  className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm text-[#2D3436]
                             placeholder:text-[#B2BEC3]
                             focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894]
                             transition-all duration-200"
                />
              </div>

              {/* Email — read only */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-[#636E72] uppercase tracking-wider mb-1.5"
                >
                  Account Email
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    readOnly
                    className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm text-[#636E72]
                               bg-[#F8F9FC] focus:outline-none cursor-default pr-24"
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-lg"
                    style={{ background: '#E8F8F4', color: '#00B894' }}
                  >
                    from account
                  </span>
                </div>
              </div>

              {/* URL preview */}
              <div
                className="rounded-xl p-4 border"
                style={{ background: '#F8FFFE', borderColor: '#CCF2EA' }}
              >
                <p className="text-xs font-semibold text-[#00B894] uppercase tracking-wider mb-2">
                  Your clock-in URL
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#B2BEC3] text-xs font-mono">tiktik.app/c/</span>
                  <span
                    className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg"
                    style={{ background: '#CCF2EA', color: '#00A381' }}
                  >
                    {slugPreview}
                  </span>
                  <span className="text-[#B2BEC3] text-xs font-mono">/clockin</span>
                </div>
                <p className="text-[#B2BEC3] text-xs mt-2">
                  This is the link you&apos;ll open on your iPad for staff to clock in and out.
                </p>
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
                disabled={loading || !isReady}
                className="relative w-full py-3.5 rounded-xl font-semibold text-sm text-white
                           transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    loading || !isReady
                      ? '#00B894'
                      : 'linear-gradient(135deg, #00B894 0%, #00C9A7 100%)',
                  boxShadow:
                    loading || !isReady
                      ? 'none'
                      : '0 4px 14px rgba(0,184,148,0.35)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.75s linear infinite' }}
                    />
                    Creating your center…
                  </span>
                ) : (
                  'Create Center & Go to Dashboard →'
                )}
              </button>

              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </form>
          </div>
        </div>

        {/* What happens next */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: '🏫', title: 'Center created', desc: 'Your center profile is saved securely.' },
            { icon: '📱', title: 'iPad link ready', desc: 'Open your clock-in URL on any tablet.' },
            { icon: '📊', title: 'Dashboard live', desc: 'Track attendance and export payroll.' },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-white rounded-xl border border-[#E9EEF2] p-4 text-center"
            >
              <span className="text-2xl">{icon}</span>
              <p className="text-xs font-semibold text-[#2D3436] mt-2">{title}</p>
              <p className="text-xs text-[#B2BEC3] mt-1 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[#B2BEC3] mt-6">
          Trusted by daycare operators across Canada
        </p>
      </div>
    </div>
  )
}
