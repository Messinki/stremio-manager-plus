import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccounts } from '@/hooks/useAccounts'
import { useAccountStore } from '@/store/accountStore'
import { useUIStore } from '@/store/uiStore'
import { SUPPORTED_DEBRID_SERVICES } from '@/lib/debrid-config'
import { AlertCircle, Eye, EyeOff, Key } from 'lucide-react'
import { useEffect, useState } from 'react'

export function AccountForm() {
  const isOpen = useUIStore((state) => state.isAddAccountDialogOpen)
  const closeDialog = useUIStore((state) => state.closeAddAccountDialog)
  const editingAccount = useUIStore((state) => state.editingAccount)
  const { addAccountByAuthKey, addAccountByCredentials, updateAccount, loading } = useAccounts()

  const { setDebridKey } = useAccountStore()

  const [mode, setMode] = useState<'authKey' | 'credentials'>('credentials')
  const [name, setName] = useState('')
  const [authKey, setAuthKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [debridApiKey, setDebridApiKey] = useState('')
  const [showDebridKey, setShowDebridKey] = useState(false)
  const [debridService, setDebridService] = useState('realdebrid')

  useEffect(() => {
    if (editingAccount) {
      setName(editingAccount.name)
      if (editingAccount.email) {
        setMode('credentials')
        setEmail(editingAccount.email)
        // Leave the password field blank on edit. If the user types something
        // in, that's treated as "change the password to this".
        setPassword('')
      } else {
        setMode('authKey')
        // Don't surface the existing auth key in the input — keep the field
        // blank so it can't be shoulder-surfed from the edit dialog.
        setAuthKey('')
      }
    } else {
      // Reset defaults for add mode
      setMode('credentials')
      setName('')
      setAuthKey('')
      setEmail('')
      setPassword('')
      setError('')
    }
    // Always reset debrid fields
    setDebridApiKey('')
    setShowDebridKey(false)
    setDebridService('realdebrid')
  }, [editingAccount, isOpen])

  const handleClose = () => {
    closeDialog()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (editingAccount) {
        // Update mode
        await updateAccount(editingAccount.id, {
          name: name.trim(),
          // Only pass auth details if they are provided/changed
          authKey: mode === 'authKey' && authKey ? authKey.trim() : undefined,
          // When password is provided, always pass email too (even if unchanged)
          email:
            mode === 'credentials' && (password || email !== editingAccount.email)
              ? email.trim() || editingAccount.email
              : undefined,
          password: mode === 'credentials' && password ? password : undefined,
        })
        // Save debrid key if provided
        if (debridApiKey.trim()) {
          await setDebridKey(editingAccount.id, debridService, debridApiKey.trim())
        }
      } else {
        // Add mode
        if (mode === 'authKey') {
          if (!authKey.trim()) {
            setError('Auth key is required')
            return
          }
          await addAccountByAuthKey(authKey.trim(), name.trim() || 'My Account')
        } else {
          if (!email.trim() || !password.trim()) {
            setError('Email and password are required')
            return
          }
          await addAccountByCredentials(email.trim(), password, name.trim() || email.trim())
        }
      }
      handleClose()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${editingAccount ? 'update' : 'add'} account`
      )
    }
  }

  const isEditing = !!editingAccount

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Account' : 'Add Stremio Account'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update account details. Leave credentials blank to keep them unchanged.'
              : 'Add an account using either your auth key or email and password'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2 border-b pb-2">
            <Button
              type="button"
              variant={mode === 'credentials' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('credentials')}
            >
              Email & Password
              {!isEditing && <span className="ml-2 text-xs opacity-75">(Recommended)</span>}
            </Button>
            <Button
              type="button"
              variant={mode === 'authKey' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('authKey')}
            >
              Auth Key
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Account Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Account"
            />
          </div>

          {mode === 'authKey' ? (
            <div className="space-y-2">
              <Label htmlFor="authKey">Auth Key</Label>
              <Input
                id="authKey"
                type="password"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                placeholder={
                  isEditing ? 'Leave blank to keep unchanged' : 'Enter your Stremio auth key'
                }
                required={!isEditing}
              />
              <p className="text-xs text-muted-foreground">
                <a href="/faq" target="_blank" className="text-primary hover:underline">
                  How to find your auth key
                </a>
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isEditing ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEditing ? 'Leave blank to keep unchanged' : 'Enter your password'}
                  required={!isEditing}
                />
              </div>
            </>
          )}

          {/* Debrid API Key Section */}
          {isEditing && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <Label>Debrid API Key</Label>
              </div>

              <select
                value={debridService}
                onChange={(e) => setDebridService(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SUPPORTED_DEBRID_SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Input
                  type={showDebridKey ? 'text' : 'password'}
                  value={debridApiKey}
                  onChange={(e) => setDebridApiKey(e.target.value)}
                  placeholder={
                    editingAccount?.debridKeys?.[debridService]
                      ? '••••• (key saved - enter new to replace)'
                      : 'Enter API key'
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowDebridKey(!showDebridKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showDebridKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {editingAccount?.debridKeys && Object.keys(editingAccount.debridKeys).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Saved keys:{' '}
                  {Object.keys(editingAccount.debridKeys)
                    .map((s) => SUPPORTED_DEBRID_SERVICES.find((d) => d.value === s)?.label || s)
                    .join(', ')}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Used to inject your API key into addons installed from the library.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-md px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-destructive">{error}</p>
                  {error.includes('Invalid email or password') && (
                    <p className="text-xs text-destructive/80 mt-1">
                      Double-check your email and password. Passwords are case-sensitive.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? isEditing
                  ? 'Updating...'
                  : 'Adding...'
                : isEditing
                  ? 'Update Account'
                  : 'Add Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
