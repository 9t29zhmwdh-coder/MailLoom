import { create } from 'zustand'
import { AppSettings, api } from '../lib/tauri'

const DEFAULT_SETTINGS: AppSettings = {
  // Ohne ausdrueckliche Wahl bleibt alles lokal.
  ai_backend: 'ollama',
  ollama_url: 'http://localhost:11434',
  text_model: 'qwen3.5:4b',
  claude_model: 'claude-haiku-4-5-20251001',
  auto_classify: true,
  auto_sync: false,
  sync_interval_minutes: 30,
  max_emails_per_sync: 500,
  ms_client_id: '',
}

interface SettingsStore {
  settings: AppSettings
  setSettings: (s: AppSettings) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: s => set({ settings: s }),
  loadSettings: async () => {
    try {
      const settings = await api.getSettings()
      set({ settings })
    } catch {}
  },
}))
