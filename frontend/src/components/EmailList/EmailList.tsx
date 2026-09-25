import { useState } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { EmailDetail } from '../EmailDetail/EmailDetail'
import { api, formatDate, categoryEmoji, categoryLabel, type EmailEntry } from '../../lib/tauri'
import { useT } from '../../lib/i18n'

export function EmailList() {
  const { emails, selected, selectEmail, markAsRead, loading, searchQuery, setSearch, loadEmails } = useEmailStore()
  const t = useT()

  const handleSearch = async (q: string) => {
    setSearch(q)
    if (q.length >= 2) {
      const results = await api.searchEmails(q).catch(() => [] as EmailEntry[])
      useEmailStore.setState({ emails: results })
    } else if (q.length === 0) {
      loadEmails()
    }
  }

  const handleSelect = (email: EmailEntry) => {
    selectEmail(email)
    if (!email.is_read) markAsRead(email.id)
  }

  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Errors used to be swallowed and the mail removed from the list anyway,
  // while it stayed on the server. Now the list only changes when the server did.
  const handleDelete = async (email: EmailEntry) => {
    try {
      const outcome = await api.deleteEmail(email.id)
      const text = outcome.kind === 'moved_to_trash'
        ? t('emailList.movedToTrash').replace('{folder}', outcome.folder)
        : outcome.kind === 'removed' ? t('emailList.removed') : t('emailList.flaggedOnly')
      setNotice({ ok: outcome.kind !== 'flagged_only', text })
      useEmailStore.setState(s => ({
        emails: s.emails.filter(e => e.id !== email.id),
        selected: s.selected?.id === email.id ? null : s.selected,
      }))
    } catch (e) {
      setNotice({ ok: false, text: `${t('emailList.deleteFailed')}: ${String(e)}` })
    }
  }

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r border-gh-border flex flex-col">
        <div className="p-2 border-b border-gh-border">
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder={t('emailList.searchPlaceholder')}
            className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-sm text-gh-text placeholder-[#484f58] focus:outline-hidden focus:border-gh-blue"
          />
        </div>

        {notice && (
          <div className={`px-3 py-2 text-xs border-b border-gh-border ${notice.ok ? 'text-gh-green' : 'text-gh-red'}`}>
            {notice.text}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gh-muted text-sm">{t('emailList.loading')}</div>
          ) : emails.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gh-muted text-sm">{t('emailList.noEmails')}</div>
          ) : (
            emails.map(email => (
              <EmailRow
                key={email.id}
                email={email}
                selected={selected?.id === email.id}
                onClick={() => handleSelect(email)}
                onDelete={() => handleDelete(email)}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selected ? (
          <EmailDetail email={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-gh-muted">
            <div className="text-center">
              <div className="text-4xl mb-2">📭</div>
              <div>{t('emailList.selectEmail')}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EmailRow({ email, selected, onClick, onDelete }: {
  email: EmailEntry
  selected: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const t = useT()
  const cat = email.classification?.category
  return (
    <div
      className={`relative border-b border-[#21262d] transition-colors ${selected ? 'bg-[#21262d]' : hovered ? 'bg-gh-surface' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button onClick={onClick} className="w-full text-left p-3 pr-8">
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {!email.is_read && (
              <div className="w-1.5 h-1.5 rounded-full bg-gh-blue shrink-0 mt-1" />
            )}
            <span className="text-xs text-gh-muted truncate">
              {email.from.name ?? email.from.address}
            </span>
          </div>
          <span className="text-xs text-[#484f58] shrink-0">{formatDate(email.date)}</span>
        </div>
        <div className={`text-sm truncate mb-0.5 ${email.is_read ? 'text-gh-muted' : 'text-gh-text font-medium'}`}>
          {email.subject || t('emailList.noSubject')}
        </div>
        <div className="flex items-center gap-1.5">
          {cat && (
            <span className="text-xs text-[#484f58]">
              {categoryEmoji(cat)} {categoryLabel(cat)}
            </span>
          )}
          {email.attachments.length > 0 && (
            <span className="text-xs text-[#484f58]">📎 {email.attachments.length}</span>
          )}
          {email.is_flagged && <span className="text-xs">⭐</span>}
          {(email.classification?.phishing_score ?? 0) > 0.5 && (
            <span className="text-xs text-gh-red">⚠️</span>
          )}
        </div>
      </button>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title={t('settings.remove')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-sm text-gh-red hover:bg-[#f8514920] transition-colors text-sm"
        >
          🗑
        </button>
      )}
    </div>
  )
}
