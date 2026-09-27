import * as SQLite from 'expo-sqlite';

const DB_NAME = 'rentaltrack.db';
let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Opens (or returns existing) shared SQLite connection.
 * Must be called once at app startup (in initializeDatabase) before any
 * other code tries to use getSharedDb().
 */
export const openSharedDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return _db;
};

/**
 * Synchronous getter — throws if openSharedDb() has not been awaited yet.
 */
export const getSharedDb = (): SQLite.SQLiteDatabase => {
  if (!_db) {
    throw new Error('DB not initialized. Call openSharedDb() first.');
  }
  return _db;
};
