import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent database migrations applied at API startup.
 *
 * Each step uses IF NOT EXISTS / IF EXISTS guards so the migration is safe to
 * run repeatedly and on databases that are already fully migrated.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Migration: add player_name as the immutable ownership key on game_results ──
    //
    // Old schema: uniqueness enforced on (first_name, last_name) display fields.
    // New schema: uniqueness enforced on player_name (canonical lower-case name
    //             from player_progress), preventing cross-player overwrite attacks.

    // 1. Add player_name column as nullable — no-op if it already exists.
    await client.query(`
      ALTER TABLE game_results
        ADD COLUMN IF NOT EXISTS player_name text;
    `);

    // 2. Backfill player_name for legacy rows that don't have it yet.
    //    Derive from the stored display name using the same convention the server
    //    now uses when writing: lower-case first_name, then ' ' + lower-case
    //    last_name unless last_name is the fallback sentinel 'operator'.
    await client.query(`
      UPDATE game_results
      SET player_name = CASE
        WHEN lower(last_name) = 'operator'
          THEN lower(first_name)
        ELSE lower(first_name) || ' ' || lower(last_name)
      END
      WHERE player_name IS NULL;
    `);

    // 3. Any rows still NULL after the above (extremely unlikely) get a stable
    //    fallback derived from their primary key so NOT NULL can be enforced.
    await client.query(`
      UPDATE game_results
      SET player_name = 'legacy_' || id::text
      WHERE player_name IS NULL;
    `);

    // 4. Drop the old (first_name, last_name) composite unique index if it still
    //    exists from the previous schema version.
    await client.query(`
      DROP INDEX IF EXISTS game_results_participant_name_unique;
    `);

    // 5. Create the new unique index on player_name — no-op if already present.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS game_results_player_name_unique
        ON game_results (player_name);
    `);

    // 6. Now that every row has a value and the unique index is in place, enforce
    //    NOT NULL on the column.
    await client.query(`
      ALTER TABLE game_results
        ALTER COLUMN player_name SET NOT NULL;
    `);

    await client.query("COMMIT");
    logger.info("Database migrations applied successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Database migration failed");
    throw err;
  } finally {
    client.release();
  }
}
