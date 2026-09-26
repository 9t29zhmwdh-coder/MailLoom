import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { t, dateLocale } from './i18n'

// ─── Types ──────────────────────────────────────────────────────────────────

export type Protocol = 'Imap' | 'Pop3'

export interface EmailAddress { name?: string; address: string }

export interface Attachment { filename: string; mime_type: string; size: number; content_id?: string }

export type EmailCategory =
  | 'Important' | 'Work' | 'Private' | 'Invoice' | 'Newsletter'
  | 'Social' | 'Ads' | 'Government' | 'Package' | 'Calendar'
  | 'Subscription' | 'Spam' | 'Phishing' | 'FollowUp' | 'Review' | 'Other'

export interface Classification {
  category: EmailCategory
  confidence: number
  tags: string[]
  summary?: string
  extracted_amount?: number
  extracted_currency?: string
  extracted_due_date?: string
  extracted_event_date?: string
  extracted_sender_name?: string
  tracking_number?: string
  tracking_carrier?: string
  is_subscription: boolean
  subscription_service?: string
  renewal_date?: string
  cancel_link?: string
  phishing_score: number
  phishing_reasons: string[]
  follow_up_hint?: string
  reply_suggestion?: string
  classified_by: string
}

export interface EmailEntry {
  id: string
  account_id: string
  message_id: string
  uid: number
  mailbox: string
  subject: string
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  date: string
  body_text?: string
  body_html?: string
  attachments: Attachment[]
  is_read: boolean
  is_flagged: boolean
  size: number
  hash?: string
  thread_id?: string
  classification?: Classification
  fetched_at: string
}

export interface EmailAccount {
  id: string
  label: string
  email_address: string
  imap_host: string
  imap_port: number
  protocol: Protocol
  username: string
  use_tls: boolean
  mailboxes: string[]
  last_sync?: string
  enabled: boolean
}

/** Microsoft device sign-in: the person enters `user_code` at `verification_uri`. */
export interface DeviceCode {
  device_code: string; user_code: string; verification_uri: string
  expires_in: number; interval: number
}

/** What deleting did on the server. */
export type DeleteOutcome =
  | { kind: 'moved_to_trash'; folder: string }
  | { kind: 'removed' }
  | { kind: 'flagged_only' }

export interface AppSettings {
  /// Which backend classifies. 'ollama' keeps everything on the machine,
  /// 'claude' sends sender, subject and the first 800 characters of the body
  /// to Anthropic.
  ai_backend: string
  ollama_url: string
  text_model: string
  claude_model: string
  auto_classify: boolean
  auto_sync: boolean
  sync_interval_minutes: number
  max_emails_per_sync: number
  ms_client_id: string
}

export interface FolderSuggestion {
  action: 'merge' | 'rename' | 'create' | 'delete' | string
  folder: string
  target: string | null
  reason: string
}

/// Mirrors Rust's ActionStatus. The Failed variant carries the server's reason,
/// so serde emits an object for it while the other variants are plain strings.
export type ActionStatus = 'Pending' | 'Applied' | 'Skipped' | { Failed: string }

export function actionFailureReason(status: ActionStatus): string | null {
  return typeof status === 'object' && 'Failed' in status ? status.Failed : null
}

export interface OrganizeAction {
  id: string
  email_id: string
  email_subject: string
  from_address: string
  kind: string
  target_folder?: string
  reason: string
  status: ActionStatus
  undoable: boolean
  created_at: string
}

/// Applied and failed are reported separately: one number cannot distinguish
/// "everything moved" from "everything was marked done while the server refused".
export interface ApplyReport {
  applied: number
  failed: number
  first_error?: string
}

/// Mirrors Rust's RuleCondition and RuleAction. Unit variants serialise to a
/// bare string, variants with data to a single-key object.
export type RuleCondition =
  | { FromContains: string }
  | { SubjectContains: string }
  | { BodyContains: string }
  | 'HasAttachment'
  | { SenderDomain: string }
  | { HasCategory: EmailCategory }

export type RuleAction =
  | { MoveToFolder: string }
  | { AddTag: string }
  | 'MarkRead'
  | 'MarkSpam'
  | { SetCategory: EmailCategory }

export interface FilterRule {
  id: string
  name: string
  conditions: RuleCondition[]
  match_all: boolean
  actions: RuleAction[]
  enabled: boolean
  confirmed_by_user: boolean
  ai_suggested: boolean
  created_at: string
}

export interface RuleInput {
  id?: string
  name: string
  conditions: RuleCondition[]
  match_all: boolean
  actions: RuleAction[]
  enabled: boolean
}

export interface EmailStats {
  total_emails: number
  unread_count: number
  classified_count: number
  accounts_count: number
  by_category: Record<string, number>
  invoices_total: number
  packages_count: number
  phishing_count: number
  subscriptions_count: number
  follow_up_count: number
}

// ─── API ────────────────────────────────────────────────────────────────────

export const api = {
  // accounts
  listAccounts: ()                               => invoke<EmailAccount[]>('list_accounts'),
  addAccount: (account: EmailAccount, password: string) => invoke<EmailAccount>('add_account', { account, password }),
  updateAccount: (account: EmailAccount)         => invoke<void>('update_account', { account }),
  deleteAccount: (id: string)                    => invoke<void>('delete_account', { id }),
  testConnection: (account: EmailAccount, password: string) => invoke<string[]>('test_connection', { account, password }),
  microsoftLoginStart: ()                        => invoke<DeviceCode>('microsoft_login_start'),
  microsoftLoginFinish: (account: EmailAccount, code: DeviceCode) =>
    invoke<EmailAccount>('microsoft_login_finish', { account, code }),
  listMailboxes: (accountId: string)             => invoke<string[]>('list_mailboxes', { accountId }),
  syncAccount: (accountId: string)               => invoke<number>('sync_account', { accountId }),

  // emails
  listEmails: (accountId?: string, category?: string, limit?: number, offset?: number) =>
    invoke<EmailEntry[]>('list_emails', { accountId, category, limit, offset }),
  getEmail: (id: string)                         => invoke<EmailEntry | null>('get_email', { id }),
  searchEmails: (query: string, limit?: number)  => invoke<EmailEntry[]>('search_emails', { query, limit }),
  markRead: (id: string, read: boolean)          => invoke<void>('mark_read', { id, read }),
  markFlagged: (id: string, flagged: boolean)    => invoke<void>('mark_flagged', { id, flagged }),
  deleteEmail: (id: string)                      => invoke<DeleteOutcome>('delete_email', { id }),

  // classify
  classifyEmail: (emailId: string)               => invoke<void>('classify_email', { emailId }),
  classifyBatch: (limit?: number)                => invoke<number>('classify_batch', { limit }),
  checkBackend: ()                               => invoke<boolean>('check_ollama'),
  generateSummary: (emailId: string)             => invoke<string>('generate_summary', { emailId }),
  suggestFolderReorganization: (accountId: string) => invoke<FolderSuggestion[]>('suggest_folder_reorganization', { accountId }),

  // claude key
  setClaudeKey: (key: string)                    => invoke<void>('set_claude_key', { key }),
  getClaudeKeyStatus: ()                         => invoke<boolean>('get_claude_key_status'),

  // actions
  updateCategory: (id: string, category: string) => invoke<void>('update_category', { id, category }),

  listActions: ()                                => invoke<OrganizeAction[]>('list_actions'),
  proposeActions: ()                             => invoke<number>('propose_actions'),
  applyAction: (actionId: string)                => invoke<ActionStatus>('apply_action', { actionId }),
  applyAllActions: ()                            => invoke<ApplyReport>('apply_all_actions'),
  skipAction: (actionId: string)                 => invoke<void>('skip_action', { actionId }),
  skipAllActions: ()                             => invoke<number>('skip_all_actions'),

  // rules
  listRules: ()                                  => invoke<FilterRule[]>('list_rules'),
  saveRule: (input: RuleInput)                   => invoke<FilterRule>('save_rule', { input }),
  setRuleEnabled: (ruleId: string, enabled: boolean) => invoke<void>('set_rule_enabled', { ruleId, enabled }),
  deleteRule: (ruleId: string)                   => invoke<void>('delete_rule', { ruleId }),
  runRules: ()                                   => invoke<number>('run_rules'),

  // stats
  getStats: ()                                   => invoke<EmailStats>('get_stats'),

  // settings
  getSettings: ()                                => invoke<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings)          => invoke<void>('save_settings', { settings }),
}

// ─── Events ─────────────────────────────────────────────────────────────────

export const events = {
  onSyncProgress: (cb: (emailId: string) => void) =>
    listen<string>('sync://progress', e => cb(e.payload)),
  onSyncDone: (cb: (count: number) => void) =>
    listen<number>('sync://done', e => cb(e.payload)),
  onClassifyProgress: (cb: (data: { done: number; total: number; email_id: string }) => void) =>
    listen('classify://progress', e => cb(e.payload as any)),
  onClassifyDone: (cb: (count: number) => void) =>
    listen<number>('classify://done', e => cb(e.payload)),
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function categoryLabel(cat: EmailCategory): string {
  return t(`category.${cat}`)
}

export function categoryEmoji(cat: EmailCategory): string {
  const emojis: Record<EmailCategory, string> = {
    Important: '⭐', Work: '💼', Private: '🏠', Invoice: '🧾',
    Newsletter: '📰', Social: '💬', Ads: '📢', Government: '🏛️',
    Package: '📦', Calendar: '📅', Subscription: '🔄', Spam: '🗑️',
    Phishing: '⚠️', FollowUp: '↩️', Review: '👁️', Other: '📧',
  }
  return emojis[cat] ?? '📧'
}

export function categoryColor(cat: EmailCategory): string {
  const colors: Partial<Record<EmailCategory, string>> = {
    Important: '#f0883e', Work: '#58a6ff', Invoice: '#d29922',
    Phishing: '#f85149', Package: '#3fb950', Calendar: '#bc8cff',
    Spam: '#8b949e', Newsletter: '#79c0ff',
  }
  return colors[cat] ?? '#8b949e'
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  const locale = dateLocale()
  if (days === 0) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return t('date.yesterday')
  if (days < 7) return d.toLocaleDateString(locale, { weekday: 'short' })
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}
