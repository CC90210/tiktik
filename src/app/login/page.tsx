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
      // After signup, check if email confirmation is required
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
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold">
            <span className="text-[#00B894]">TIK</span>
            <span className="text-[#2D3436]">TIK</span>
          </h1>
          <p className="text-[#636E72] mt-2">Camera-verified time tracking for daycares</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl border border-[#E9EEF2] p-8">
          <h2 className="text-xl font-bold text-[#2D3436] mb-6">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="director@daycare.com"
                className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#636E72] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-[#E9EEF2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00B894]/30 focus:border-[#00B894] transition-all"
              />
            </div>

            {error && (
              <div className="bg-[#FF6B6B]/10 text-[#FF6B6B] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#00B894] text-white rounded-xl font-medium hover:bg-[#00A884] disabled:opacity-50 transition-all"
            >
              {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
              className="text-sm text-[#00B894] hover:text-[#00A884] font-medium"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-[#B2BEC3] mt-6">
          Because the camera doesn&apos;t lie.
        </p>
      </div>
    </div>
  )
}
