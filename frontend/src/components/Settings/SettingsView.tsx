import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { api, type DeviceCode, type AppSettings, type EmailAccount } from '../../lib/tauri'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAccountStore } from '../../stores/accountStore'
import { useT, getLang } from '../../lib/i18n'

// ─── Provider definitions ───────────────────────────────────────────────────

type ProviderKey = 'icloud' | 'm365' | 'gmail' | 'fastmail' | 'custom'

interface Provider {
  label: string
  icon: string
  host: string
  port: string
  appPasswordUrl?: string
  appPasswordSteps?: string[]
}

function getProviders(): Record<ProviderKey, Provider> {
  const de = getLang() === 'de'
  return {
    icloud: {
      label: 'iCloud',
      icon: '☁️',
      host: 'imap.mail.me.com',
      port: '993',
      appPasswordUrl: 'https://appleid.apple.com/account/manage',
      appPasswordSteps: de ? [
        'Melde dich auf appleid.apple.com an',
        'Sicherheit → App-Passwörter',
        'Klick (+) → Name: MailLoom',
        'Kopiere das generierte Passwort',
      ] : [
        'Sign in at appleid.apple.com',
        'Security → App-Specific Passwords',
        'Click (+) → Name: MailLoom',
        'Copy the generated password',
      ],
    },
    m365: {
      label: 'Microsoft 365 / Outlook.com',
      icon: '🪟',
      host: 'outlook.office365.com',
      port: '993',
      // Microsoft allows IMAP only with OAuth2; see MicrosoftFlow.
      appPasswordUrl: '',
      appPasswordSteps: [],
    },
    gmail: {
      label: 'Gmail',
      icon: '✉️',
      host: 'imap.gmail.com',
      port: '993',
      appPasswordUrl: 'https://myaccount.google.com/apppasswords',
      appPasswordSteps: de ? [
        'Öffne myaccount.google.com',
        'Sicherheit → App-Passwörter',
        'App: MailLoom → Erstellen',
        'Kopiere das 16-stellige Passwort',
      ] : [
        'Open myaccount.google.com',
        'Security → App passwords',
        'App: MailLoom → Create',
        'Copy the 16-character password',
      ],
    },
    fastmail: {
      label: 'Fastmail',
      icon: '⚡',
      host: 'imap.fastmail.com',
      port: '993',
    },
    custom: {
      label: de ? 'Benutzerdefiniert' : 'Custom',
      icon: '⚙️',
      host: '',
      port: '993',
    },
  }
}

function detectProvider(email: string): ProviderKey | null {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) return 'icloud'
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'm365'
  if (['gmail.com', 'googlemail.com'].includes(domain)) return 'gmail'
  if (['fastmail.com', 'fastmail.fm'].includes(domain)) return 'fastmail'
  return null
}

// ─── Main View ──────────────────────────────────────────────────────────────

export function SettingsView() {
  const { settings, setSettings } = useSettingsStore()
  const { accounts, loadAccounts } = useAccountStore()
  const [draft, setDraft] = useState<AppSettings>({ ...settings })
  const [saved, setSaved] = useState(false)
  const [activeModal, setActiveModal] = useState<ProviderKey | null>(null)
  const t = useT()
  const PROVIDERS = getProviders()

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setDraft(d => ({ ...d, [k]: v }))

  const handleSave = async () => {
    await api.saveSettings(draft)
    setSettings(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-gh-text mb-6">{t('settings.title')}</h2>

      {/* Accounts */}
      <Section title={t('settings.emailAccounts')}>
        {accounts.length > 0 && (
          <div className="space-y-2 mb-4">
            {accounts.map(acc => (
              <AccountRow key={acc.id} account={acc} onDelete={() => loadAccounts()} />
            ))}
          </div>
        )}
        <div className="text-xs text-gh-muted mb-2">{t('settings.addAccount')}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.entries(PROVIDERS) as [ProviderKey, Provider][]).map(([key, p]) => (
            <button
              key={key}
              onClick={() => setActiveModal(key)}
              className="flex items-center gap-2 px-3 py-2.5 bg-gh-bg hover:bg-[#1c2128] border border-gh-border hover:border-gh-blue rounded-lg text-left transition-colors group"
            >
              <span className="text-lg leading-none">{p.icon}</span>
              <span className="text-sm text-[#c9d1d9] group-hover:text-gh-text">{p.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Claude */}
      <ClaudeSection draft={draft} set={set} />

      {/* Sync */}
      <Section title={t('settings.syncOptions')}>
        <Label>{t('settings.msClientId')}</Label>
        <Input
          value={draft.ms_client_id}
          onChange={v => set('ms_client_id', v.trim())}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
        <Label>{t('settings.maxEmailsPerSync')}</Label>
        <Input
          value={String(draft.max_emails_per_sync)}
          onChange={v => set('max_emails_per_sync', parseInt(v) || 500)}
          placeholder="500"
        />
        <Toggle
          label={t('settings.autoSync')}
          value={draft.auto_sync}
          onChange={v => set('auto_sync', v)}
        />
        <Label>{t('settings.syncIntervalMinutes')}</Label>
        <Input
          value={String(draft.sync_interval_minutes)}
          onChange={v => set('sync_interval_minutes', Math.max(1, parseInt(v) || 30))}
          placeholder="30"
        />
        <Toggle
          label={t('settings.autoClassifyAfterSync')}
          value={draft.auto_classify}
          onChange={v => set('auto_classify', v)}
        />
      </Section>

      <button
        onClick={handleSave}
        className="w-full py-2.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm rounded-lg transition-colors"
      >
        {saved ? `${t('settings.saved')}` : t('settings.save')}
      </button>

      {activeModal && (
        <AccountModal
          providerKey={activeModal}
          onDone={() => { setActiveModal(null); loadAccounts() }}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  )
}

// ─── Account Modal ───────────────────────────────────────────────────────────

function AccountModal({
  providerKey,
  onDone,
  onClose,
}: {
  providerKey: ProviderKey
  onDone: () => void
  onClose: () => void
}) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const t = useT()
  const provider = getProviders()[providerKey]
  const needsAppPassword = !!provider.appPasswordUrl

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-gh-surface border border-gh-border rounded-xl shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gh-border">
          <div className="flex items-center gap-2">
            <span className="text-xl">{provider.icon}</span>
            <h3 className="text-sm font-semibold text-gh-text">{provider.label} {t('settings.addProviderTitle')}</h3>
          </div>
          <button onClick={onClose} className="text-gh-muted hover:text-gh-text transition-colors text-lg">
            ✕
          </button>
        </div>
        <div className="p-5">
          {providerKey === 'm365' ? (
            <MicrosoftFlow onDone={onDone} />
          ) : needsAppPassword ? (
            <AppPasswordFlow providerKey={providerKey} onDone={onDone} />
          ) : (
            <GenericAccountForm
              initialHost={provider.host}
              initialPort={provider.port}
              initialLabel={provider.label}
              onDone={onDone}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Microsoft sign-in (OAuth2 device code) ───────────────────────────────────
// Exchange Online and outlook.com accept IMAP only with OAuth2; the app-password
// steps shown here before could never lead to a working account.

function MicrosoftFlow({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)

  const start = async () => {
    setError('')
    try {
      const c = await api.microsoftLoginStart()
      setCode(c)
      QRCode.toDataURL(c.verification_uri, { width: 180, margin: 2, color: { dark: '#ffffff', light: '#161b22' } })
        .then(setQr).catch(() => {})
      setWaiting(true)
      const account: EmailAccount = {
        id: crypto.randomUUID(), label: 'Microsoft', email_address: email,
        imap_host: 'outlook.office365.com', imap_port: 993, protocol: 'Imap',
        username: email, use_tls: true, mailboxes: ['INBOX'], enabled: true,
      }
      await api.microsoftLoginFinish(account, c)
      onDone()
    } catch (e) {
      setError(String(e))
    } finally {
      setWaiting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gh-muted">{t('settings.microsoftIntro')}</p>
      <div>
        <Label>{t('settings.emailAddress')}</Label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={waiting}
          placeholder="user@company.com" autoFocus
          className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-2 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue placeholder-[#484f58]" />
      </div>
      {!code || !waiting ? (
        <button onClick={start} disabled={!email.includes('@') || waiting}
          className="w-full py-2 bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm rounded-lg transition-colors disabled:opacity-40">
          {t('settings.microsoftSignIn')}
        </button>
      ) : (
        <div className="text-center space-y-3">
          <p className="text-sm text-gh-text">{t('settings.microsoftOpen')}</p>
          <p className="text-sm font-mono text-gh-blue select-all">{code.verification_uri}</p>
          {qr && <img src={qr} alt="" className="mx-auto rounded-md" />}
          <p className="text-sm text-gh-text">{t('settings.microsoftEnterCode')}</p>
          <p className="text-2xl font-mono tracking-widest text-gh-text select-all">{code.user_code}</p>
          <p className="text-xs text-gh-muted">⟳ {t('settings.microsoftWaiting')}</p>
        </div>
      )}
      {error && <p className="text-xs text-gh-red">{error}</p>}
    </div>
  )
}

// ─── App-Passwort Flow (iCloud, Gmail) ────────────────────────────────────────

function AppPasswordFlow({ providerKey, onDone }: { providerKey: ProviderKey; onDone: () => void }) {
  const t = useT()
  const provider = getProviders()[providerKey]
  const [step, setStep] = useState<'email' | 'qr' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (provider.appPasswordUrl) {
      QRCode.toDataURL(provider.appPasswordUrl, {
        width: 220,
        margin: 2,
        color: { dark: '#ffffff', light: '#161b22' },
      }).then(setQrDataUrl).catch(() => {})
    }
  }, [provider.appPasswordUrl])

  const handleConnect = async () => {
    setTesting(true); setError('')
    const account: EmailAccount = {
      id: crypto.randomUUID(),
      label: providerKey === 'icloud' ? 'iCloud' : providerKey === 'm365' ? 'Microsoft 365' : 'Gmail',
      email_address: email,
      imap_host: provider.host,
      imap_port: parseInt(provider.port),
      protocol: 'Imap',
      username: email,
      use_tls: true,
      mailboxes: ['INBOX'],
      enabled: true,
    }
    try {
      await api.testConnection(account, appPassword)
      await api.addAccount(account, appPassword)
      onDone()
    } catch (e: any) {
      setError(String(e))
    } finally {
      setTesting(false)
    }
  }

  if (step === 'email') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gh-muted">
          {provider.label} {t('settings.appPasswordNeeded')}
        </p>
        <div>
          <Label>{t('settings.emailAddress')}</Label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={`user@${providerKey === 'icloud' ? 'icloud.com' : providerKey === 'm365' ? 'outlook.com' : 'gmail.com'}`}
            autoFocus
            className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-2 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue placeholder-[#484f58]"
          />
        </div>
        <button
          onClick={() => setStep('qr')}
          disabled={!email.includes('@')}
          className="w-full py-2 bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm rounded-lg transition-colors disabled:opacity-40"
        >
          {t('settings.continueGeneratePassword')} →
        </button>
      </div>
    )
  }

  if (step === 'qr') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gh-text font-medium">
          {t('settings.scanQr')}
        </p>
        <div className="flex gap-4 items-start">
          {qrDataUrl && (
            <div className="shrink-0 rounded-lg overflow-hidden border border-gh-border">
              <img src={qrDataUrl} alt="QR-Code" width={120} height={120} />
            </div>
          )}
          <ol className="space-y-1.5 text-xs text-gh-muted">
            {provider.appPasswordSteps?.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gh-blue font-bold shrink-0">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="text-xs text-[#484f58]">
          {t('settings.orDirect')}{' '}
          <span className="text-gh-blue font-mono">{provider.appPasswordUrl}</span>
        </div>
        <button
          onClick={() => setStep('password')}
          className="w-full py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm rounded-lg transition-colors"
        >
          {t('settings.haveAppPassword')} →
        </button>
      </div>
    )
  }

  // step === 'password'
  return (
    <div className="space-y-4">
      <p className="text-sm text-gh-muted">
        {t('settings.pasteAppPassword')} <span className="text-gh-text">{email}</span>.
      </p>
      <div>
        <Label>{t('settings.appPassword')}</Label>
        <input
          type="password"
          value={appPassword}
          onChange={e => setAppPassword(e.target.value)}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && appPassword) handleConnect() }}
          className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-2 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue placeholder-[#484f58]"
        />
      </div>
      {error && <div className="text-xs text-gh-red">{error}</div>}
      <div className="flex gap-2">
        <button
          onClick={() => setStep('qr')}
          className="px-4 py-2 text-sm text-gh-muted hover:text-gh-text transition-colors"
        >
          {t('settings.back')}
        </button>
        <button
          onClick={handleConnect}
          disabled={testing || !appPassword}
          className="flex-1 py-2 bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm rounded-lg transition-colors disabled:opacity-40"
        >
          {testing ? t('settings.connecting') : t('settings.connect')}
        </button>
      </div>
    </div>
  )
}

// ─── Generisches Formular (Fastmail, Benutzerdefiniert) ──────────────────────

function GenericAccountForm({
  initialHost,
  initialPort,
  initialLabel,
  onDone,
}: {
  initialHost: string
  initialPort: string
  initialLabel: string
  onDone: () => void
}) {
  const [label, setLabel] = useState(initialLabel)
  const [email, setEmail] = useState('')
  const [host, setHost] = useState(initialHost)
  const [port, setPort] = useState(initialPort)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const t = useT()

  const handleEmailChange = (v: string) => {
    setEmail(v)
    if (!username) setUsername(v)
    const detected = detectProvider(v)
    const providers = getProviders()
    if (detected && providers[detected]) {
      setHost(providers[detected].host)
      setPort(providers[detected].port)
    }
  }

  const handleAdd = async () => {
    setTesting(true); setError('')
    const account: EmailAccount = {
      id: crypto.randomUUID(),
      label, email_address: email, imap_host: host,
      imap_port: parseInt(port) || 993, protocol: 'Imap',
      username: username || email, use_tls: true,
      mailboxes: ['INBOX'], enabled: true,
    }
    try {
      await api.testConnection(account, password)
      await api.addAccount(account, password)
      onDone()
    } catch (e: any) {
      setError(String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t('settings.label')}</Label><Input value={label} onChange={setLabel} placeholder={t('settings.myAccount')} /></div>
        <div><Label>{t('settings.email')}</Label><Input value={email} onChange={handleEmailChange} placeholder="user@example.com" /></div>
        <div><Label>{t('settings.imapHost')}</Label><Input value={host} onChange={setHost} placeholder="imap.example.com" /></div>
        <div><Label>{t('settings.port')}</Label><Input value={port} onChange={setPort} placeholder="993" /></div>
        <div><Label>{t('settings.username')}</Label><Input value={username} onChange={setUsername} placeholder="user@example.com" /></div>
        <div><Label>{t('settings.password')}</Label><PasswordInput value={password} onChange={setPassword} /></div>
      </div>
      {error && <div className="text-xs text-gh-red">{error}</div>}
      <button
        onClick={handleAdd}
        disabled={testing || !host || !email || !password}
        className="w-full py-2 bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm rounded-lg transition-colors disabled:opacity-40"
      >
        {testing ? t('settings.testingConnection') : t('settings.saveAccount')}
      </button>
    </div>
  )
}

// ─── Account Row ────────────────────────────────────────────────────────────

function AccountRow({ account, onDelete }: { account: EmailAccount; onDelete: () => void }) {
  const t = useT()
  const handleDelete = async () => {
    if (confirm(`"${account.label}" ${t('settings.removeAccountConfirm')}`)) {
      await api.deleteAccount(account.id)
      onDelete()
    }
  }
  return (
    <div className="flex items-center justify-between bg-gh-bg border border-gh-border rounded-md p-3">
      <div>
        <div className="text-sm text-gh-text font-medium">{account.label}</div>
        <div className="text-xs text-gh-muted">
          {account.email_address} · {account.imap_host}:{account.imap_port}
        </div>
      </div>
      <button onClick={handleDelete} className="text-xs text-gh-red hover:underline">
        {t('settings.remove')}
      </button>
    </div>
  )
}

// ─── Claude Section ──────────────────────────────────────────────────────────

function ClaudeSection({
  draft,
  set,
}: {
  draft: AppSettings
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
}) {
  const [checking, setChecking] = useState(false)
  const [claudeMsg, setClaudeMsg] = useState('')
  const [keyStatus, setKeyStatus] = useState<boolean | null>(null)
  const [pendingKey, setPendingKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const t = useT()

  useEffect(() => {
    api.getClaudeKeyStatus().then(ok => setKeyStatus(ok)).catch(() => setKeyStatus(false))
  }, [])

  const handleCheck = async () => {
    setChecking(true); setClaudeMsg('')
    const ok = await api.checkBackend().catch(() => false)
    setClaudeMsg(ok ? `${t('settings.claudeReachable')} ✓` : t('settings.claudeUnreachable'))
    setChecking(false)
  }

  const handleSaveKey = async () => {
    if (!pendingKey.trim()) return
    setSavingKey(true)
    try {
      await api.setClaudeKey(pendingKey.trim())
      setKeyStatus(true)
      setPendingKey('')
      setClaudeMsg(`${t('settings.apiKeySaved')} ✓`)
    } catch {
      setClaudeMsg(t('settings.apiKeySaveError'))
    }
    setSavingKey(false)
  }

  return (
    <Section title={t('settings.claudeSection')}>
      {/* The choice comes first: it decides whether any email content leaves
          the machine, so it belongs above the key field rather than below it. */}
      <div className="mb-4">
        <div className="text-xs text-gh-muted mb-2">{t('settings.backendLabel')}</div>
        <div className="flex gap-2">
          {(['ollama', 'claude'] as const).map(b => (
            <button
              key={b}
              onClick={() => set('ai_backend', b)}
              className={`flex-1 text-left px-3 py-2 rounded-md border transition-colors ${
                (draft.ai_backend ?? 'ollama') === b
                  ? 'border-gh-blue bg-[#58a6ff11]'
                  : 'border-gh-border hover:border-[#484f58]'
              }`}
            >
              <div className="text-sm text-gh-text">
                {b === 'ollama' ? t('settings.backendLocal') : t('settings.backendCloud')}
              </div>
              <div className="text-xs text-gh-muted mt-0.5">
                {b === 'ollama' ? t('settings.backendLocalHint') : t('settings.backendCloudHint')}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-gh-muted">{t('settings.apiKeyLabel')}</span>
        {keyStatus === true && <span className="text-xs text-gh-green font-medium">{t('settings.keySet')} ✓</span>}
        {keyStatus === false && <span className="text-xs text-gh-red">{t('settings.keyNotSet')}</span>}
      </div>
      {(keyStatus === false || keyStatus === null) && (
        <div className="flex gap-2 mb-3">
          <input
            type="password"
            value={pendingKey}
            onChange={e => setPendingKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue placeholder-[#484f58]"
          />
          <button
            onClick={handleSaveKey}
            disabled={savingKey || !pendingKey.trim()}
            className="px-3 py-1.5 text-xs bg-[#1f6feb] hover:bg-[#388bfd] text-white rounded-sm transition-colors disabled:opacity-50"
          >
            {savingKey ? t('settings.saving') : t('settings.save2')}
          </button>
        </div>
      )}
      {keyStatus === true && (
        <button onClick={() => setKeyStatus(false)} className="text-xs text-gh-muted hover:text-gh-text mb-3">
          {t('settings.replaceKey')}
        </button>
      )}
      <Label>{t('settings.model')}</Label>
      <select
        value={draft.claude_model ?? 'claude-haiku-4-5-20251001'}
        onChange={e => set('claude_model', e.target.value)}
        className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue mb-3"
      >
        <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 ({t('settings.modelFast')})</option>
        <option value="claude-sonnet-4-6">claude-sonnet-4-6 ({t('settings.modelBalanced')})</option>
        <option value="claude-opus-4-8">claude-opus-4-8 ({t('settings.modelStrongest')})</option>
      </select>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="mt-1 px-3 py-1.5 text-xs bg-[#21262d] hover:bg-gh-border text-gh-muted hover:text-gh-text rounded-sm transition-colors"
      >
        {checking ? t('settings.testing') : t('settings.testConnection')}
      </button>
      {claudeMsg && (
        <div className={`mt-1 text-xs ${claudeMsg.includes('✓') ? 'text-gh-green' : 'text-gh-red'}`}>
          {claudeMsg}
        </div>
      )}
    </Section>
  )
}

// ─── Shared Primitives ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-gh-surface border border-gh-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gh-muted uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gh-muted mb-1">{children}</div>
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue mb-3 placeholder-[#484f58]"
    />
  )
}

function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="password"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-sm text-gh-text font-mono focus:outline-hidden focus:border-gh-blue mb-3"
    />
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-[#c9d1d9]">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${value ? 'bg-[#238636]' : 'bg-gh-border'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
