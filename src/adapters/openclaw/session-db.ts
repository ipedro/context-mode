/**
 * OpenClawSessionDB — OpenClaw-specific extension of SessionDB.
 *
 * Adds session_key mapping (openclaw_session_map table) and session
 * rename support needed for OpenClaw's gateway restart re-keying.
 *
 * The shared SessionDB remains unaware of session_key; all OpenClaw-specific
 * session mapping lives here.
 */

import { SessionDB } from "../../session/db.js";
import type { StoredEvent } from "../../session/db.js";
import type { PreparedStatement } from "../../db-base.js";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

/** Row from the openclaw_session_map table. */
export interface SessionMapRow {
  session_key: string;
  session_id: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// OpenClawSessionDB
// ─────────────────────────────────────────────────────────

export class OpenClawSessionDB extends SessionDB {
  /**
   * OpenClaw-specific prepared statements, separate from the parent's
   * private statement cache. Created in prepareStatements() after
   * super.prepareStatements() finishes.
   *
   * `declare` prevents TypeScript from emitting a field initializer
   * that would wipe the value set during the base constructor's
   * prepareStatements() call chain.
   */
  private declare ocStmts: Map<string, PreparedStatement>;

  // ── Schema ──

  protected initSchema(): void {
    super.initSchema();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS openclaw_session_map (
        session_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // FTS5 content-sync table for BM25-ranked search over session_events.
    // Uses content= to avoid data duplication — FTS index is rebuilt from
    // the base table. content_rowid maps to session_events.id.
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts USING fts5(
        data,
        content='session_events',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS session_events_ai AFTER INSERT ON session_events BEGIN
        INSERT INTO session_events_fts(rowid, data) VALUES (new.id, new.data);
      END;

      CREATE TRIGGER IF NOT EXISTS session_events_ad AFTER DELETE ON session_events BEGIN
        INSERT INTO session_events_fts(session_events_fts, rowid, data) VALUES ('delete', old.id, old.data);
      END;

      CREATE TRIGGER IF NOT EXISTS session_events_au AFTER UPDATE ON session_events BEGIN
        INSERT INTO session_events_fts(session_events_fts, rowid, data) VALUES ('delete', old.id, old.data);
        INSERT INTO session_events_fts(rowid, data) VALUES (new.id, new.data);
      END;
    `);
  }

  protected prepareStatements(): void {
    super.prepareStatements();

    this.ocStmts = new Map<string, PreparedStatement>();

    const p = (key: string, sql: string) => {
      this.ocStmts.set(key, this.db.prepare(sql) as PreparedStatement);
    };

    p("getMostRecentSession",
      `SELECT session_id FROM openclaw_session_map WHERE session_key = ?`);

    p("upsertSessionMap",
      `INSERT INTO openclaw_session_map (session_key, session_id)
       VALUES (?, ?)
       ON CONFLICT(session_key) DO UPDATE SET
         session_id = excluded.session_id`);

    p("deleteSessionMap",
      `DELETE FROM openclaw_session_map WHERE session_key = ?`);

    p("renameSessionMeta",
      `UPDATE session_meta SET session_id = ? WHERE session_id = ?`);

    p("renameSessionEvents",
      `UPDATE session_events SET session_id = ? WHERE session_id = ?`);

    p("renameSessionResume",
      `UPDATE session_resume SET session_id = ? WHERE session_id = ?`);

    p("renameSessionMap",
      `UPDATE openclaw_session_map SET session_id = ? WHERE session_id = ?`);

    p("searchEvents",
      `SELECT e.id, e.session_id, e.type, e.category, e.priority, e.data,
              e.source_hook, e.created_at, e.data_hash,
              rank AS bm25_rank
       FROM session_events_fts f
       JOIN session_events e ON e.id = f.rowid
       WHERE session_events_fts MATCH ?
         AND e.session_id = ?
       ORDER BY rank
       LIMIT ?`);
  }

  /** Shorthand to retrieve an OpenClaw-specific cached statement. */
  private oc(key: string): PreparedStatement {
    return this.ocStmts.get(key)!;
  }

  // ═══════════════════════════════════════════
  // Session key mapping
  // ═══════════════════════════════════════════

  /**
   * Ensure a session metadata entry exists with an associated session_key.
   * Calls the parent's 2-param ensureSession and also records the mapping
   * in openclaw_session_map.
   */
  ensureSessionWithKey(sessionId: string, projectDir: string, sessionKey: string): void {
    this.ensureSession(sessionId, projectDir);
    this.oc("upsertSessionMap").run(sessionKey, sessionId);
  }

  /**
   * Get the session_id of the most recently mapped session for a given sessionKey.
   * Returns null if no sessions exist for that key.
   */
  getMostRecentSession(sessionKey: string): string | null {
    const row = this.oc("getMostRecentSession").get(sessionKey) as { session_id: string } | undefined;
    return row?.session_id ?? null;
  }

  /**
   * Rename a session ID in-place across all tables (session_meta, session_events,
   * session_resume, openclaw_session_map), preserving all events, metadata,
   * and resume snapshots. Used when OpenClaw re-keys session IDs on gateway
   * restart so accumulated events survive the re-key.
   */
  renameSession(oldId: string, newId: string): void {
    this.db.transaction(() => {
      this.oc("renameSessionMeta").run(newId, oldId);
      this.oc("renameSessionEvents").run(newId, oldId);
      this.oc("renameSessionResume").run(newId, oldId);
      this.oc("renameSessionMap").run(newId, oldId);
    })();
  }

  /**
   * Remove a session_key mapping from openclaw_session_map.
   * Called on command:stop to clean up agent session tracking.
   */
  removeSessionKey(sessionKey: string): void {
    this.oc("deleteSessionMap").run(sessionKey);
  }

  // ═══════════════════════════════════════════
  // FTS5 search
  // ═══════════════════════════════════════════

  /**
   * Search session events using FTS5 BM25 ranking.
   *
   * Sanitises the query to prevent FTS5 syntax errors from user input,
   * then runs a MATCH query joined back to session_events for full rows.
   *
   * @param sessionId  - Only return events belonging to this session.
   * @param query      - Free-text search query (user message).
   * @param topK       - Maximum number of results to return.
   * @param minScore   - Minimum relevance score (BM25 rank is negative;
   *                     lower = more relevant). Results with rank > -minScore
   *                     are filtered out.
   * @returns Matching StoredEvent rows ordered by relevance.
   */
  searchEvents(
    sessionId: string,
    query: string,
    topK: number = 3,
    minScore: number = 0.1,
  ): StoredEvent[] {
    // Sanitise: strip FTS5 operators, collapse whitespace, take first 200 chars
    const sanitised = query
      .replace(/[*"():^{}~<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    if (!sanitised) return [];

    try {
      const rows = this.oc("searchEvents").all(sanitised, sessionId, topK) as Array<
        StoredEvent & { bm25_rank: number }
      >;
      // FTS5 BM25 rank is negative (more negative = more relevant).
      // Filter out low-relevance results: keep rows where -rank >= minScore.
      return rows
        .filter((r) => -r.bm25_rank >= minScore)
        .map(({ bm25_rank: _, ...event }) => event);
    } catch {
      // FTS5 query parse failure — graceful degradation
      return [];
    }
  }
}
