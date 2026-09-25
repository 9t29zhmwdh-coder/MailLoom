import { useEffect, useState } from 'react'
import { useAccountStore } from './stores/accountStore'
import { useSettingsStore } from './stores/settingsStore'
import { useEmailStore } from './stores/emailStore'
import { api, events } from './lib/tauri'
import { useT, useLangStore } from './lib/i18n'
import { Dashboard } from './components/Dashboard/Dashboard'
import { EmailList } from './components/EmailList/EmailList'
import { CategorySidebar } from './components/Categories/CategorySidebar'
import { ActionsView } from './components/Actions/ActionsView'
import { SettingsView } from './components/Settings/SettingsView'

type Tab = 'dashboard' | 'emails' | 'actions' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const { ollamaOnline, setOllamaOnline, loadAccounts, loadStats } = useAccountStore()
  const { loadSettings, settings } = useSettingsStore()
  const { loadEmails, filterCategory } = useEmailStore()
  const t = useT()
  const { lang, toggle } = useLangStore()

  useEffect(() => {
    loadAccounts()
    loadStats()
    loadSettings()
    api.checkBackend().then(setOllamaOnline).catch(() => {})

    const cleanup: Array<() => void> = []
    events.onSyncDone(count => {
      loadEmails()
      loadStats()
    }).then(u => cleanup.push(u))
    events.onClassifyDone(() => {
      loadStats()
      loadEmails()
    }).then(u => cleanup.push(u))

    return () => cleanup.forEach(u => u())
  }, [])

  // Auto sync runs here, not on the dashboard, so it keeps going on every page.
  useEffect(() => {
    if (!settings?.auto_sync) return
    const minutes = Math.max(1, settings.sync_interval_minutes || 30)
    const id = setInterval(async () => {
      const accounts = useAccountStore.getState().accounts.filter(a => a.enabled)
      for (const acc of accounts) {
        await api.syncAccount(acc.id).catch(() => {})
      }
      if (settings.auto_classify) await api.classifyBatch(500).catch(() => {})
      loadAccounts()
    }, minutes * 60_000)
    return () => clearInterval(id)
  }, [settings?.auto_sync, settings?.sync_interval_minutes, settings?.auto_classify])

  useEffect(() => {
    if (tab === 'emails') loadEmails(undefined, filterCategory ?? undefined)
  }, [tab, filterCategory])

  const navItem = (id: Tab, icon: string, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors
        ${tab === id
          ? 'bg-[#21262d] text-gh-text'
          : 'text-gh-muted hover:bg-gh-surface hover:text-gh-text'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )

  return (
    <div className="flex h-screen bg-gh-bg text-gh-text overflow-hidden">
      {/* Left Nav */}
      <div className="w-52 shrink-0 border-r border-gh-border flex flex-col">
        <div className="p-4 border-b border-gh-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">✉️</span>
            <span className="font-semibold text-gh-text">MailLoom</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? 'bg-gh-green' : 'bg-gh-red'}`} />
            {/* Names the backend actually in use. It said "Claude" regardless of
                the setting, which was wrong the moment the local model became
                the default. */}
            <span className="text-xs text-gh-muted">
              {(settings?.ai_backend === 'claude' ? 'Claude' : 'Ollama')}
              {' '}
              {ollamaOnline ? t('nav.backendOnline') : t('nav.backendOffline')}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {navItem('dashboard', '📊', t('nav.dashboard'))}
          {navItem('emails', '📧', t('nav.emails'))}
          {navItem('actions', '⚡', t('nav.actions'))}
          {navItem('settings', '⚙️', t('nav.settings'))}
        </nav>

        {tab === 'emails' && (
          <div className="border-t border-gh-border">
            <CategorySidebar />
          </div>
        )}

        <button
          onClick={toggle}
          className="m-2 px-2 py-1.5 text-xs text-gh-muted hover:text-gh-text border border-gh-border rounded-md transition-colors"
        >
          {lang === 'en' ? 'DE' : 'EN'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'emails'    && <EmailList />}
        {tab === 'actions'   && <ActionsView />}
        {tab === 'settings'  && <SettingsView />}
      </div>
    </div>
  )
}
