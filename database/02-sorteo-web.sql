CREATE SCHEMA IF NOT EXISTS sorteo_web;
SET search_path TO sorteo_web;

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_username ON admin_users(username);
    

      CREATE TABLE IF NOT EXISTS participants (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email_encrypted TEXT NOT NULL,
        doc_encrypted TEXT NOT NULL,
        university_encrypted TEXT DEFAULT '',
        code_encrypted TEXT DEFAULT '',
        career_encrypted TEXT DEFAULT '',
        is_special_case INTEGER NOT NULL DEFAULT 0,
        special_hospital_encrypted TEXT DEFAULT '',
        special_reason_encrypted TEXT DEFAULT '',
        assigned_hospital_encrypted TEXT DEFAULT '',
        rank_position INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_participants_active ON participants(is_active);
    

      CREATE TABLE IF NOT EXISTS hospitals (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        municipality TEXT NOT NULL,
        total_slots INTEGER NOT NULL DEFAULT 0,
        assigned_slots INTEGER NOT NULL DEFAULT 0,
        available_slots INTEGER NOT NULL DEFAULT 0,
        career_slots_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hospitals_code ON hospitals(code);
    

      CREATE TABLE IF NOT EXISTS draw_history (
        id SERIAL PRIMARY KEY,
        user_words_encrypted TEXT NOT NULL,
        server_phrase_encrypted TEXT NOT NULL,
        weather_snapshot_encrypted TEXT NOT NULL,
        k_selected_count INTEGER NOT NULL,
        hex_breakdown_encrypted TEXT NOT NULL,
        hex_sum INTEGER NOT NULL,
        winners_ids_encrypted TEXT NOT NULL,
        special_cases_encrypted TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_draw_history_created ON draw_history(created_at);
    