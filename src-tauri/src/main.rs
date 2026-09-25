mod commands;
mod credentials;
mod error;
mod state;

use mp_core::db;
use state::AppState;

#[tokio::main]
async fn main() {
    let db_path = dirs_path();
    let pool = db::open_db(&db_path).await.expect("Failed to open database");
    let settings = mp_core::db::queries::load_settings(&pool)
        .await
        .unwrap_or_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new(pool, settings))
        .invoke_handler(tauri::generate_handler![
            commands::accounts::list_accounts,
            commands::accounts::add_account,
            commands::accounts::update_account,
            commands::accounts::delete_account,
            commands::accounts::test_connection,
            commands::accounts::microsoft_login_start,
            commands::accounts::microsoft_login_finish,
            commands::accounts::list_mailboxes,
            commands::accounts::sync_account,
            commands::emails::list_emails,
            commands::emails::get_email,
            commands::emails::search_emails,
            commands::emails::mark_read,
            commands::emails::mark_flagged,
            commands::emails::delete_email,
            commands::emails::update_category,
            commands::classify::classify_email,
            commands::classify::classify_batch,
            commands::classify::check_ollama,
            commands::classify::generate_summary,
            commands::classify::suggest_folder_reorganization,
            commands::actions::list_actions,
            commands::actions::propose_actions,
            commands::actions::apply_action,
            commands::actions::apply_all_actions,
            commands::actions::skip_action,
            commands::actions::skip_all_actions,
            commands::rules::list_rules,
            commands::rules::save_rule,
            commands::rules::set_rule_enabled,
            commands::rules::delete_rule,
            commands::rules::run_rules,
            commands::stats::get_stats,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::set_claude_key,
            commands::settings::get_claude_key_status,
        ])
        .run(tauri::generate_context!())
        .expect("MailLoom failed to start");
}

fn dirs_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{}/Library/Application Support/com.raystudio.mailloom/mailloom.db", home)
}
