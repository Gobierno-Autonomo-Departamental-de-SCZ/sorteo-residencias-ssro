import { Pool } from 'pg';
import {
  encryptPacked,
  decryptPacked,
  hashPassword,
  verifyPassword
} from '../crypto/cipher.js';

export interface ParticipantRecord {
  studentId?: number;
  personId?: number;
  hospitalId?: number | null;
  quotaId?: number;
  id: number;
  fullName: string;
  email: string;
  documentId: string;
  university?: string;
  career?: string;
  studentCode?: string;
  isSpecialCase?: boolean;
  specialHospital?: string;
  specialReason?: string;
  assignedHospital?: string;
  rankPosition?: number;
  createdAt: string;
  isActive: boolean;
}

export interface HospitalRecord {
  id: number;
  code: string;
  name: string;
  municipality: string;
  totalSlots: number;
  assignedSlots: number;
  availableSlots: number;
  careerSlotsJson?: string;
  createdAt: string;
}

export interface DrawHistoryRecord {
  algorithm?: string;
  inputHash?: string;
  rule?: string;
  actor?: string;
  id: number;
  userWords: string[];
  serverPhrase: string;
  weatherSnapshot: string;
  kSelectedCount: number;
  hexBreakdown: Array<{ char: string; hex: string; value: number }>;
  hexSum: number;
  winners: ParticipantRecord[];
  specialCases: ParticipantRecord[];
  createdAt: string;
}

export class EncryptedDatabase {
  protected pool: Pool;
  constructor(connectionString: string = process.env.DATABASE_URL || '') {
    if (!connectionString.startsWith('postgres')) throw new Error('DATABASE_URL de PostgreSQL es obligatoria.');
    this.pool = new Pool({ connectionString, options: '-c search_path=sorteo_web,public', max: 2, connectionTimeoutMillis: 5000 });
    this.pool.on('error', err => console.error('PostgreSQL:', err.message));
  }
  public async ready(): Promise<void> {
    await this.pool.query('SELECT id FROM sorteo_web.admin_users LIMIT 0');
  }
  private db = {
    prepare: (sql: string) => {
      let n = 0;
      const text = sql.replace(/\?/g, () => '$' + (++n));
      return {
        get: async (...args: any[]) => (await this.pool.query(text, args)).rows[0],
        all: async (...args: any[]) => (await this.pool.query(text, args)).rows,
        run: async (...args: any[]) => {
          const query = /^\s*INSERT/i.test(text) ? text.trim().replace(/;$/, '') + ' RETURNING id' : text;
          const result = await this.pool.query(query, args);
          return { lastInsertRowid: result.rows[0]?.id };
        }
      };
    }
  };
  public async getRecentDraws(): Promise<any[]> {
    return (await this.pool.query('SELECT id, k_selected_count, created_at FROM sorteo_web.draw_history ORDER BY id DESC LIMIT 10')).rows;
  }

  // --- MÉTODOS DE ADMINISTRADOR ---
  public async createAdmin(username: string, plainPassword: string): Promise<void> {
    const existing = await this.db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
    if (existing) {
      throw new Error(`AdminYaExiste: El usuario '${username}' ya se encuentra registrado.`);
    }

    const hash = hashPassword(plainPassword);
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO admin_users (username, password_hash, created_at)
      VALUES (?, ?, ?)
    `);
    await stmt.run(username, hash, now);
  }

  public async verifyAdmin(username: string, plainPassword: string): Promise<boolean> {
    const row = await this.db.prepare('SELECT password_hash FROM admin_users WHERE username = ?').get(username) as { password_hash: string } | undefined;
    if (!row) {
      // Dummy verification to mitigate timing attacks against username enumeration
      verifyPassword(plainPassword, 'scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000');
      return false;
    }
    return verifyPassword(plainPassword, row.password_hash);
  }

  // --- MÉTODOS DE PARTICIPANTES (ESTUDIANTES Y CASOS ESPECIALES) ---
  public async addParticipant(
    fullName: string,
    email: string,
    documentId: string,
    university: string = 'UAGRM',
    studentCode: string = '',
    isSpecialCase: boolean = false,
    specialHospital: string = '',
    specialReason: string = '',
    career: string = 'MEDICINA'
  ): Promise<number> {
    const emailEnc = encryptPacked(email);
    const docEnc = encryptPacked(documentId);
    const uniEnc = encryptPacked(university);
    const codeEnc = encryptPacked(studentCode);
    const hospEnc = encryptPacked(specialHospital);
    const reasonEnc = encryptPacked(specialReason);
    const careerEnc = encryptPacked(career);

    const stmt = this.db.prepare(`
      INSERT INTO participants (
        full_name,
        email_encrypted,
        doc_encrypted,
        university_encrypted,
        code_encrypted,
        is_special_case,
        special_hospital_encrypted,
        special_reason_encrypted,
        career_encrypted,
        created_at,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const now = new Date().toISOString();
    const result = await stmt.run(
      fullName,
      emailEnc,
      docEnc,
      uniEnc,
      codeEnc,
      isSpecialCase ? 1 : 0,
      hospEnc,
      reasonEnc,
      careerEnc,
      now
    );

    return Number(result.lastInsertRowid);
  }

  private mapParticipantRow(r: any): ParticipantRecord {
    const email = decryptPacked(r.email_encrypted);
    const documentId = decryptPacked(r.doc_encrypted);
    const university = r.university_encrypted ? decryptPacked(r.university_encrypted) : 'UAGRM';
    const studentCode = r.code_encrypted ? decryptPacked(r.code_encrypted) : '';
    const career = r.career_encrypted ? decryptPacked(r.career_encrypted) : 'MEDICINA';
    const specialHospital = r.special_hospital_encrypted ? decryptPacked(r.special_hospital_encrypted) : '';
    const specialReason = r.special_reason_encrypted ? decryptPacked(r.special_reason_encrypted) : '';
    const assignedHospital = r.assigned_hospital_encrypted ? decryptPacked(r.assigned_hospital_encrypted) : '';

    return {
      id: r.id,
      fullName: r.full_name,
      email,
      documentId,
      university,
      career,
      studentCode,
      isSpecialCase: Boolean(r.is_special_case),
      specialHospital: specialHospital || undefined,
      specialReason: specialReason || undefined,
      assignedHospital: assignedHospital || undefined,
      rankPosition: r.rank_position || undefined,
      createdAt: r.created_at,
      isActive: Boolean(r.is_active)
    };
  }

  public async getActiveParticipants(): Promise<ParticipantRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM participants
      WHERE is_active = 1
      ORDER BY id ASC
    `);
    const rows = await stmt.all() as any[];
    return rows.map(r => this.mapParticipantRow(r));
  }

  public async getRegularHabilitados(): Promise<ParticipantRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM participants
      WHERE is_active = 1 AND is_special_case = 0
      ORDER BY id ASC
    `);
    const rows = await stmt.all() as any[];
    return rows.map(r => this.mapParticipantRow(r));
  }

  public async getSpecialCases(): Promise<ParticipantRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM participants
      WHERE is_active = 1 AND is_special_case = 1
      ORDER BY id ASC
    `);
    const rows = await stmt.all() as any[];
    return rows.map(r => this.mapParticipantRow(r));
  }

  public async getParticipantById(id: number): Promise<ParticipantRecord | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM participants
      WHERE id = ?
    `);
    const r = await stmt.get(id) as any;
    if (!r) return null;
    return this.mapParticipantRow(r);
  }

  public async clearAllParticipants(): Promise<void> {
    await this.db.prepare('DELETE FROM participants').run();
  }

  // --- MÉTODOS DE HOSPITALES Y CUPOS ---
  public async addHospital(
    code: string,
    name: string,
    municipality: string,
    totalSlots: number,
    availableSlots?: number,
    assignedSlots: number = 0,
    careerSlotsJson: string = '{}'
  ): Promise<number> {
    const avail = availableSlots !== undefined ? availableSlots : totalSlots;
    const stmt = this.db.prepare(`
      INSERT INTO hospitals (code, name, municipality, total_slots, assigned_slots, available_slots, career_slots_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    const result = await stmt.run(code, name, municipality, totalSlots, assignedSlots, avail, careerSlotsJson, now);
    return Number(result.lastInsertRowid);
  }

  public async getAllHospitals(): Promise<HospitalRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM hospitals ORDER BY name ASC');
    const rows = await stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      municipality: r.municipality,
      totalSlots: r.total_slots,
      assignedSlots: r.assigned_slots || 0,
      availableSlots: r.available_slots,
      careerSlotsJson: r.career_slots_json || '{}',
      createdAt: r.created_at
    }));
  }

  public async clearAllHospitals(): Promise<void> {
    await this.db.prepare('DELETE FROM hospitals').run();
  }

  // --- MÉTODOS DE HISTORIAL DE SORTEO ---
  public async saveDraw(
    userWords: string[],
    serverPhrase: string,
    weatherSnapshot: string,
    kSelectedCount: number,
    hexBreakdown: Array<{ char: string; hex: string; value: number }>,
    hexSum: number,
    winnerIds: number[],
    assignedHospitalsMap: Record<number, string> = {},
    specialCaseIds: number[] = []
  ): Promise<number> {
    const userWordsEnc = encryptPacked(JSON.stringify(userWords));
    const serverPhraseEnc = encryptPacked(serverPhrase);
    const weatherEnc = encryptPacked(weatherSnapshot);
    const hexBreakdownEnc = encryptPacked(JSON.stringify(hexBreakdown));

    const winnersPayload = winnerIds.map((id, idx) => ({
      id,
      rankPosition: idx + 1,
      assignedHospital: assignedHospitalsMap[id] || ''
    }));
    const winnersEnc = encryptPacked(JSON.stringify(winnersPayload));
    const specialsEnc = encryptPacked(JSON.stringify(specialCaseIds));

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO draw_history (
        user_words_encrypted,
        server_phrase_encrypted,
        weather_snapshot_encrypted,
        k_selected_count,
        hex_breakdown_encrypted,
        hex_sum,
        winners_ids_encrypted,
        special_cases_encrypted,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await stmt.run(
      userWordsEnc,
      serverPhraseEnc,
      weatherEnc,
      kSelectedCount,
      hexBreakdownEnc,
      hexSum,
      winnersEnc,
      specialsEnc,
      now
    );

    return Number(result.lastInsertRowid);
  }

  public async getDrawById(id: number): Promise<DrawHistoryRecord | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM draw_history WHERE id = ?
    `);
    const r = await stmt.get(id) as any;
    if (!r) return null;

    const userWords: string[] = JSON.parse(decryptPacked(r.user_words_encrypted));
    const serverPhrase = decryptPacked(r.server_phrase_encrypted);
    const weatherSnapshot = decryptPacked(r.weather_snapshot_encrypted);
    const hexBreakdown = JSON.parse(decryptPacked(r.hex_breakdown_encrypted));
    const rawWinners = JSON.parse(decryptPacked(r.winners_ids_encrypted));

    const winners: ParticipantRecord[] = [];
    for (const item of rawWinners) {
      const wId = typeof item === 'number' ? item : item.id;
      const rank = typeof item === 'object' ? item.rankPosition : (winners.length + 1);
      const assignedHosp = typeof item === 'object' ? item.assignedHospital : undefined;

      const p = await this.getParticipantById(wId);
      if (p) {
        winners.push({
          ...p,
          rankPosition: rank,
          assignedHospital: assignedHosp || p.assignedHospital
        });
      }
    }

    const specialCases: ParticipantRecord[] = [];
    if (r.special_cases_encrypted) {
      try {
        const sIds: number[] = JSON.parse(decryptPacked(r.special_cases_encrypted));
        for (const sId of sIds) {
          const sp = await this.getParticipantById(sId);
          if (sp) specialCases.push(sp);
        }
      } catch (_) {}
    }

    if (specialCases.length === 0) {
      specialCases.push(...await this.getSpecialCases());
    }

    return {
      id: r.id,
      userWords,
      serverPhrase,
      weatherSnapshot,
      kSelectedCount: r.k_selected_count,
      hexBreakdown,
      hexSum: r.hex_sum,
      winners,
      specialCases,
      createdAt: r.created_at
    };
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
