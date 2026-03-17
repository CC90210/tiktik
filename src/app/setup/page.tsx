'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
        <div className="animate-pulse text-xl text-[#636E72]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold">
            <span className="text-[#00B894]">TIK</span>
            <span className="text-[#2D3436]">TIK</span>
          </h1>
          <p className="text-[#636E72] mt-2">Let&apos;s set up your daycare center</p>
        </div>

        {/* Setup form */}
        <div className="bg-white rounded-2xl border border-[#E9EEF2] p-8">
          <h2 className="text-xl font-bold text-[#2D3436] mb-6">Center Setup</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Center Name</label>
              <input
                type="text"
                value={centerName}
                onChange={e => setCenterName(e.target.value)}
                required
                placeholder="Little Picasso Halifax"
                className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Director Name</label>
              <input
                type="text"
                value={directorName}
                onChange={e => setDirectorName(e.target.value)}
                required
                placeholder="Your full name"
                className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm bg-[#F8F9FC] focus:outline-none"
                readOnly
              />
              <p className="text-xs text-[#B2BEC3] mt-1">From your account</p>
            </div>

            {error && (
              <div className="bg-[#FF6B6B]/10 text-[#FF6B6B] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !centerName || !directorName}
              className="w-full py-3 bg-[#00B894] text-white rounded-xl font-medium hover:bg-[#00A884] disabled:opacity-50 transition-all"
            >
              {loading ? 'Creating...' : 'Create Center'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
