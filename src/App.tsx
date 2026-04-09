import { AccountForm } from '@/components/accounts/AccountForm'
import { AddonInstaller } from '@/components/addons/AddonInstaller'
import { ExportDialog } from '@/components/ExportDialog'
import { ImportDialog } from '@/components/ImportDialog'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/toaster'
import { AuthPage } from '@/pages/AuthPage'
import { AppRoutes } from '@/routes'
import { useAccountStore } from '@/store/accountStore'
import { useAddonStore } from '@/store/addonStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useEffect, useState } from 'react'

function App() {
  const initializeAccounts = useAccountStore((state) => state.initialize)
  const resetAccounts = useAccountStore((state) => state.reset)
  const initializeAddons = useAddonStore((state) => state.initialize)
  const resetAddons = useAddonStore((state) => state.reset)
  const initializeAuth = useAuthStore((state) => state.initialize)
  const initializeUI = useUIStore((state) => state.initialize)
  const user = useAuthStore((state) => state.user)
  const isInitializingAuth = useAuthStore((state) => state.isInitializing)
  const [storesReady, setStoresReady] = useState(false)

  // Restore session + UI prefs on mount.
  useEffect(() => {
    initializeUI()
    initializeAuth()
  }, [initializeAuth, initializeUI])

  // Load (or wipe) the per-user data stores when the auth user changes.
  // accounts/addons live behind the session cookie, so we can't fetch them
  // until we know there's a logged-in user.
  useEffect(() => {
    if (!user) {
      resetAccounts()
      resetAddons()
      setStoresReady(false)
      return
    }
    setStoresReady(false)
    Promise.all([initializeAccounts(), initializeAddons()]).finally(() => setStoresReady(true))
  }, [user, initializeAccounts, initializeAddons, resetAccounts, resetAddons])

  if (isInitializingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Initializing Stremio Account Manager</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  if (!storesReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Loading your data</p>
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <AppRoutes />

      <AccountForm />
      <AddonInstaller />
      <ExportDialog />
      <ImportDialog />
      <Toaster />
    </Layout>
  )
}

export default App
