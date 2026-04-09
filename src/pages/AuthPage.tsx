/**
 * AuthPage — login + signup gate.
 *
 * Replaces the old MasterPasswordSetup / UnlockDialog flow. There is no
 * local password anymore; this hits the server's /api/auth/login and
 * /api/auth/register endpoints, which set an HttpOnly session cookie on
 * success. The auth store then flips `user` to non-null and <App> renders.
 */

import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock } from 'lucide-react'

type Mode = 'login' | 'register'

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)

  const isRegister = mode === 'register'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      setIsSubmitting(true)
      if (isRegister) {
        await register(trimmedEmail, password)
      } else {
        await login(trimmedEmail, password)
      }
      // On success the auth store flips `user` non-null and <App> re-renders.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000212] p-4 relative overflow-hidden">
      {/* Linear-style radial background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% -20%, #20243d 0%, #000212 80%)',
        }}
      />

      <Card className="w-full max-w-md relative z-10 border border-white/[0.08] bg-[#080b1a]/90 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] animate-slide-up">
        {/* Subtle top highlight line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-6 w-16 h-16 bg-[#0c1026] border border-white/[0.05] rounded-2xl flex items-center justify-center shadow-inner relative group">
            <div className="absolute inset-0 bg-blue-500/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <Lock className="w-8 h-8 text-slate-300 relative z-10" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-white">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {isRegister
              ? 'Sign up to manage your Stremio addons across devices'
              : 'Log in to access your Stremio addons'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 mb-6 bg-slate-900/50 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                !isRegister ? 'bg-white text-black' : 'text-slate-400 hover:text-slate-200'
              }`}
              disabled={isSubmitting}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isRegister ? 'bg-white text-black' : 'text-slate-400 hover:text-slate-200'
              }`}
              disabled={isSubmitting}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-slate-900/50 border-slate-800 focus:ring-primary/20"
                disabled={isSubmitting}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isRegister ? 'Create a password (8+ characters)' : 'Enter your password'
                }
                className="bg-slate-900/50 border-slate-800 focus:ring-primary/20"
                disabled={isSubmitting}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>

            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="bg-slate-900/50 border-slate-800 focus:ring-primary/20"
                  disabled={isSubmitting}
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && (
              <Alert
                variant="destructive"
                className="bg-destructive/10 border-destructive/20 text-destructive-foreground"
              >
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full bg-white text-black hover:bg-slate-200 transition-colors py-6 text-base font-medium"
              disabled={isSubmitting || !email || !password || (isRegister && !confirmPassword)}
            >
              {isSubmitting
                ? isRegister
                  ? 'Creating account...'
                  : 'Logging in...'
                : isRegister
                  ? 'Create account'
                  : 'Log in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
