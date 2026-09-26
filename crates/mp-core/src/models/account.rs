use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Protocol {
    Imap,
    Pop3,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAccount {
    pub id: String,
    pub label: String,
    pub email_address: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub protocol: Protocol,
    pub username: String,
    pub use_tls: bool,
    pub mailboxes: Vec<String>,
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
    pub enabled: bool,
}

impl EmailAccount {
    pub fn new_gmail(label: &str, email: &str, username: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            label: label.to_string(),
            email_address: email.to_string(),
            imap_host: "imap.gmail.com".to_string(),
            imap_port: 993,
            protocol: Protocol::Imap,
            username: username.to_string(),
            use_tls: true,
            mailboxes: vec!["INBOX".to_string()],
            last_sync: None,
            enabled: true,
        }
    }

    pub fn new_outlook(label: &str, email: &str, username: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            label: label.to_string(),
            email_address: email.to_string(),
            imap_host: "outlook.office365.com".to_string(),
            imap_port: 993,
            protocol: Protocol::Imap,
            username: username.to_string(),
            use_tls: true,
            mailboxes: vec!["INBOX".to_string()],
            last_sync: None,
            enabled: true,
        }
    }
}

fn default_claude_model() -> String {
    "claude-haiku-4-5-20251001".to_string()
}

fn default_ai_backend() -> String {
    "ollama".to_string()
}

// `default` keeps stored settings readable when fields are added or removed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub ollama_url: String,
    pub text_model: String,
    #[serde(default = "default_claude_model")]
    pub claude_model: String,
    /// Welches Backend die Klassifizierung ausfuehrt.
    ///
    /// Default ist "ollama": ohne diese Wahl liefe die Klassifizierung ueber
    /// einen Cloud-Dienst, obwohl README und Datenschutzerklaerung lokale
    /// Verarbeitung zusagen. Wer die Cloud will, waehlt sie ausdruecklich.
    #[serde(default = "default_ai_backend")]
    pub ai_backend: String,
    pub auto_classify: bool,
    pub auto_sync: bool,
    pub sync_interval_minutes: u32,
    pub max_emails_per_sync: u32,
    /// Entra app registration used for Microsoft sign-in. Empty uses the one
    /// built into the release.
    pub ms_client_id: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ollama_url: "http://localhost:11434".to_string(),
            text_model: "qwen3.5:4b".to_string(),
            claude_model: default_claude_model(),
            ai_backend: default_ai_backend(),
            auto_classify: true,
            auto_sync: false,
            sync_interval_minutes: 30,
            max_emails_per_sync: 500,
            ms_client_id: String::new(),
        }
    }
}
