import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useAccountStore } from '../../stores/accountStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { api, categoryLabel, categoryEmoji, categoryColor, type EmailCategory } from '../../lib/tauri'
import { useT, getLang } from '../../lib/i18n'

interface Props { onNavigate: (tab: 'emails' | 'actions' | 'settings') => void }

function relativeTime(raw: number | string | undefined): string {
  if (!raw) return ''
  // ISO string ("2026-06-29T10:54:32Z") or Unix timestamp (number or numeric string)
  let ms: number
  if (typeof raw === 'string' && raw.includes('T')) {
    ms = new Date(raw).getTime()
  } else {
    const n = typeof raw === 'string' ? parseFloat(raw) : raw
    // Rust stores as Unix seconds; milliseconds are >1e11
    ms = n < 1e11 ? n * 1000 : n
  }
  if (isNaN(ms)) return ''
  const diff = Math.floor((Date.now() - ms) / 1000)
  const de = getLang() === 'de'
  if (diff < 10) return de ? 'gerade eben' : 'just now'
  if (diff < 60) return de ? `vor ${diff} Sek.` : `${diff}s ago`
  if (diff < 3600) return de ? `vor ${Math.floor(diff / 60)} Min.` : `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return de ? `vor ${Math.floor(diff / 3600)} Std.` : `${Math.floor(diff / 3600)}h ago`
  return de ? `vor ${Math.floor(diff / 86400)} Tagen` : `${Math.floor(diff / 86400)}d ago`
}

export function Dashboard({ onNavigate }: Props) {
  const { accounts, stats, loadStats, loadAccounts, setSyncing, syncing } = useAccountStore()
  const t = useT()
  const [classifying, setClassifying] = useState(false)
  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, { count: number; error?: string }>>({})
  // The switch writes the setting; the timer itself runs in App, on every page.
  const { settings, setSettings } = useSettingsStore()
  const autoSync = settings.auto_sync
  const setAutoSync = (update: (v: boolean) => boolean) => {
    const next = { ...settings, auto_sync: update(settings.auto_sync) }
    setSettings(next)
    api.saveSettings(next).catch(() => {})
  }
  const [, setTick] = useState(0)

  // Relative-Zeit jede Minute neu berechnen
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])

  const syncAll = async () => {
    for (const acc of accounts) {
      if (!acc.enabled) continue
      setSyncing(acc.id)
      try {
        const count = await api.syncAccount(acc.id)
        setSyncResults(r => ({ ...r, [acc.id]: { count } }))
      } catch (e: any) {
        setSyncResults(r => ({ ...r, [acc.id]: { count: 0, error: String(e) } }))
      } finally {
        setSyncing(null)
      }
    }
    await loadAccounts()
    await loadStats()
    if (settings.auto_classify) handleClassify()
  }

  const handleSync = async (accountId: string) => {
    setSyncing(accountId)
    setSyncResults(r => ({ ...r, [accountId]: { count: 0 } }))
    try {
      const count = await api.syncAccount(accountId)
      setSyncResults(r => ({ ...r, [accountId]: { count } }))
    } catch (e: any) {
      setSyncResults(r => ({ ...r, [accountId]: { count: 0, error: String(e) } }))
    } finally {
      setSyncing(null)
      await loadAccounts()
      await loadStats()
    }
    // "Classify automatically after sync" was a setting nothing read.
    if (settings.auto_classify) handleClassify()
  }


  const handleClassify = async () => {
    setClassifying(true)
    setClassifyProgress({ done: 0, total: 0 })
    try {
      const total = await api.classifyBatch(500)
      setClassifyProgress(p => p ? { ...p, total } : { done: 0, total })
    } catch {
      setClassifying(false)
    }
  }

  const chartData = stats ? Object.entries(stats.by_category).map(([cat, count]) => ({
    name: categoryLabel(cat as EmailCategory),
    value: count,
    fill: categoryColor(cat as EmailCategory),
  })) : []

  const StatCard = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="bg-gh-surface border border-gh-border rounded-lg p-4">
      <div className="text-xs text-gh-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? 'text-gh-text'}`}>{value}</div>
      {sub && <div className="text-xs text-gh-muted mt-0.5">{sub}</div>}
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gh-text">{t('dashboard.title')}</h1>
        <div className="flex gap-2">
          <button
            onClick={handleClassify}
            disabled={classifying}
            className="px-3 py-1.5 text-xs bg-[#1f6feb] hover:bg-[#388bfd] text-white rounded-md transition-colors disabled:opacity-50"
          >
            {classifying
              ? classifyProgress
                ? `${t('dashboard.classifying')} ${classifyProgress.done}/${classifyProgress.total}`
                : t('dashboard.starting')
              : `🤖 ${t('dashboard.classifyAi')}`}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
        <StatCard label={t('dashboard.totalEmails')} value={stats?.total_emails ?? 0} />
        <StatCard label={t('dashboard.unread')} value={stats?.unread_count ?? 0} color="text-gh-blue" />
        <StatCard label={t('dashboard.classified')} value={stats?.classified_count ?? 0} color="text-gh-green" />
        <StatCard label={t('dashboard.accounts')} value={stats?.accounts_count ?? 0} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
        <StatCard label={t('dashboard.phishingDetected')} value={stats?.phishing_count ?? 0} color="text-gh-red"
          sub={stats?.phishing_count ? `⚠️ ${t('dashboard.check')}` : `✓ ${t('dashboard.safe')}`} />
        <StatCard label={t('dashboard.packages')} value={stats?.packages_count ?? 0} color="text-gh-green" />
        <StatCard label={t('dashboard.subscriptions')} value={stats?.subscriptions_count ?? 0} color="text-gh-yellow" />
        <StatCard label={t('dashboard.followUps')} value={stats?.follow_up_count ?? 0} color="text-gh-orange" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        {/* Pie Chart */}
        <div className="bg-gh-surface border border-gh-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gh-text mb-3">{t('dashboard.byCategory')}</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" outerRadius={80}
                  dataKey="value" nameKey="name">
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px' }}
                  labelStyle={{ color: '#e6edf3' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gh-muted text-sm">
              {t('dashboard.noClassifiedYet')}
            </div>
          )}
        </div>

        {/* Category List */}
        <div className="bg-gh-surface border border-gh-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gh-text mb-3">{t('dashboard.topCategories')}</h3>
          <div className="space-y-1.5 overflow-y-auto max-h-[200px]">
            {Object.entries(stats?.by_category ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => onNavigate('emails')}
                  className="flex items-center justify-between w-full px-2 py-1 rounded-sm hover:bg-[#21262d] transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span>{categoryEmoji(cat as EmailCategory)}</span>
                    <span className="text-sm text-[#c9d1d9] group-hover:text-gh-text">
                      {categoryLabel(cat as EmailCategory)}
                    </span>
                  </div>
                  <span className="text-xs text-gh-muted bg-[#21262d] px-1.5 py-0.5 rounded-full">{count}</span>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Accounts */}
      <div className="bg-gh-surface border border-gh-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gh-text">{t('dashboard.accountsSection')}</h3>
          <div className="flex items-center gap-3">
            {/* Auto-Sync Toggle */}
            <button
              onClick={() => setAutoSync(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
                autoSync
                  ? 'border-gh-green text-gh-green bg-[#3fb95015]'
                  : 'border-gh-border text-gh-muted hover:border-[#484f58]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoSync ? 'bg-gh-green animate-pulse' : 'bg-[#484f58]'}`} />
              Auto-Sync {autoSync ? t('dashboard.autoSyncOn') : t('dashboard.autoSyncOff')}
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className="text-xs text-gh-blue hover:underline"
            >
              + {t('dashboard.addAccount')}
            </button>
          </div>
        </div>

        {autoSync && (
          <div className="mb-3 text-xs text-[#484f58] flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-gh-green animate-pulse" />
            {t('dashboard.autoSyncNote')}
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="text-sm text-gh-muted text-center py-4">
            {t('dashboard.noAccountsYet')}<br />
            <button onClick={() => onNavigate('settings')} className="text-gh-blue hover:underline mt-1">
              {t('dashboard.addAccountNow')} →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map(acc => {
              const result = syncResults[acc.id]
              const isSyncing = syncing === acc.id
              return (
                <div key={acc.id} className="flex items-center justify-between p-3 bg-gh-bg rounded-md">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="text-sm text-gh-text font-medium truncate">{acc.label}</div>
                      {isSyncing && (
                        <span className="text-xs text-gh-blue animate-pulse shrink-0">{t('dashboard.syncing')}</span>
                      )}
                    </div>
                    <div className="text-xs text-gh-muted truncate">{acc.email_address}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {acc.last_sync ? (
                        <span className="text-xs text-[#484f58]">
                          {t('dashboard.lastSync')}: {relativeTime(acc.last_sync)}
                        </span>
                      ) : (
                        <span className="text-xs text-[#484f58]">{t('dashboard.neverSynced')}</span>
                      )}
                      {result && !isSyncing && (
                        result.error ? (
                          <span className="text-xs text-gh-red">{t('dashboard.error')}</span>
                        ) : (
                          <span className="text-xs text-gh-green">
                            {result.count > 0 ? `+${result.count} ${t('dashboard.newCount')}` : t('dashboard.current')}
                          </span>
                        )
                      )}
                    </div>
                    {result?.error && !isSyncing && (
                      <div className="text-xs text-gh-red mt-0.5 truncate">{result.error}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleSync(acc.id)}
                    disabled={!!syncing}
                    className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors disabled:opacity-50
                      ${isSyncing
                        ? 'bg-[#1f6feb] text-white'
                        : 'bg-[#21262d] hover:bg-gh-border text-gh-muted hover:text-gh-text'}`}
                  >
                    <span className={isSyncing ? 'animate-spin inline-block' : ''}>⟳</span>
                    {isSyncing ? `${t('dashboard.sync')}...` : t('dashboard.sync')}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
