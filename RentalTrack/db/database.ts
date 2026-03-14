// database.ts - COMPLETE VERSION WITH ALL FUNCTIONS
import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import * as SQLite from 'expo-sqlite';
import { calculateNextDueDate, calculatePaymentBreakdown, calculateTenantStatus } from '../domain/financial';
import { openSharedDb } from './shared-db';
import { assertInteger } from '../domain/ledger';
import { Payment, Reminder, Settings, Tenant } from '../libs/types';

// --- CRITICAL FIX: Lazy database initialization ---
let db: SQLite.SQLiteDatabase | null = null;
let initializationPromise: Promise<void> | null = null;

// Safe database getter that waits for initialization
const getDb = (): SQLite.SQLiteDatabase => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

// --- Custom Error Classes for Better UI Feedback ---
class RoomAlreadyExistsError extends Error {
  constructor(roomNumber: string) {
    super(`Room "${roomNumber}" is already occupied. Please choose a different room.`);
    this.name = 'RoomAlreadyExistsError';
  }
}

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Get tenant's current next due date - FIXED VERSION
 */
export const getTenantNextDueDate = async (tenantId: number, userId: string, database: SQLite.SQLiteDatabase): Promise<string> => {
  try {
    // Get tenant details
    const tenant = await database.getFirstAsync<Tenant>(
      'SELECT start_date, rent_cycle FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL', 
      [tenantId, userId]
    );
    if (!tenant) throw new Error('Tenant not found for due date calculation');

    // Try to get from last payment
    const lastPayment = await database.getFirstAsync<{ 
      next_due_date: string ;
      payment_date: string;
    }>(
      'SELECT next_due_date, payment_date FROM payments WHERE tenant_id = ? AND user_id = ? ORDER BY next_due_date DESC, payment_id DESC LIMIT 1',
      [tenantId, userId]
    );

    if (lastPayment?.next_due_date) {
      let nextDue = parseISO(lastPayment.next_due_date);
      const today = new Date();

      // If next due date is in the past, roll forward until in future
      while (nextDue <= today) {
        nextDue = calculateNextDueDate(nextDue, tenant.rent_cycle || 'monthly');
      }
      return format(nextDue, 'yyyy-MM-dd');
    }

    // No payments found, start from tenant start date
    let nextDue = calculateNextDueDate(parseISO(tenant.start_date), tenant.rent_cycle || 'monthly');
    const today = new Date();

     // Advance to next due date if start date is in past
    while (nextDue <= today) {
      nextDue = calculateNextDueDate(nextDue, tenant.rent_cycle || 'monthly');
    }
    return format(nextDue, 'yyyy-MM-dd');

  } catch (error) {
    console.error('Error getting next due date for tenant:', tenantId, error);
    // Fallback calculation
    try {
      const tenant = await database.getFirstAsync<Tenant>('SELECT start_date FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL', [tenantId, userId]);
      if (tenant) {
        const fallbackDate = addMonths(parseISO(tenant.start_date), 1);
        return format(fallbackDate, 'yyyy-MM-dd');
      }
    } catch(e) {}
    
    return format(addMonths(new Date(), 1), 'yyyy-MM-dd');
  }
};

// --- Database Initialization and Migrations ---

// Migration function to safely add new columns to existing tables
const runMigrations = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    // CHECK TENANTS TABLE
    const tenantTableInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(tenants)"
    );
    
    const hasCreditBalance = tenantTableInfo.some(column => column.name === 'credit_balance');
    const hasContractEndDate = tenantTableInfo.some(column => column.name === 'contract_end_date');
    const hasRentCycle = tenantTableInfo.some(column => column.name === 'rent_cycle');
    
    if (!hasCreditBalance) {
      console.log('🔄 Running migration: Adding credit_balance column...');
      await database.execAsync('ALTER TABLE tenants ADD COLUMN credit_balance INTEGER DEFAULT 0;');
      console.log('✅ Migration completed: credit_balance column added.');
    }
    
    if (!hasContractEndDate) {
      console.log('🔄 Running migration: Adding contract_end_date column...');
      await database.execAsync('ALTER TABLE tenants ADD COLUMN contract_end_date TEXT DEFAULT NULL;');
      console.log('✅ Migration completed: contract_end_date column added.');
    }
    
    if (!hasRentCycle) {
      console.log('🔄 Running migration: Adding rent_cycle column...');
      await database.execAsync('ALTER TABLE tenants ADD COLUMN rent_cycle TEXT DEFAULT "monthly";');
      console.log('✅ Migration completed: rent_cycle column added.');
    }

    // CHECK PAYMENTS TABLE (NEW)
    const paymentTableInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(payments)"
    );
    
    const hasRentAmountAtPayment = paymentTableInfo.some(column => column.name === 'rent_amount_at_payment');
    const hasRentCycleAtPayment = paymentTableInfo.some(column => column.name === 'rent_cycle_at_payment');
    
    if (!hasRentAmountAtPayment) {
      console.log('🔄 Running migration: Adding rent_amount_at_payment column...');
      await database.execAsync('ALTER TABLE payments ADD COLUMN rent_amount_at_payment REAL;');
      console.log('✅ Migration completed: rent_amount_at_payment column added.');
    }
    
    if (!hasRentCycleAtPayment) {
      console.log('🔄 Running migration: Adding rent_cycle_at_payment column...');
      await database.execAsync('ALTER TABLE payments ADD COLUMN rent_cycle_at_payment TEXT;');
      console.log('✅ Migration completed: rent_cycle_at_payment column added.');
    }

    // --- PHASE 3: SYNC COLUMNS MIGRATIONS ---
    const addSyncColumnsToTable = async (tableName: string, hasDeletedAt: boolean = true) => {
      const tableInfo = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
      
      if (!tableInfo.some(column => column.name === 'version')) {
        console.log(`🔄 Adding 'version' to ${tableName}...`);
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN version INTEGER DEFAULT 1;`);
      }
      if (!tableInfo.some(column => column.name === 'is_dirty')) {
        console.log(`🔄 Adding 'is_dirty' to ${tableName}...`);
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN is_dirty INTEGER DEFAULT 0;`);
      }
      if (hasDeletedAt && !tableInfo.some(column => column.name === 'deleted_at')) {
        console.log(`🔄 Adding 'deleted_at' to ${tableName}...`);
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN deleted_at TEXT DEFAULT NULL;`);
      }
      if (!tableInfo.some(column => column.name === 'user_id')) {
        console.log(`🔄 Adding 'user_id' to ${tableName}...`);
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN user_id TEXT DEFAULT '';`);
      }
      if (!tableInfo.some(column => column.name === 'updated_at')) {
        console.log(`🔄 Adding 'updated_at' to ${tableName}...`);
        const now = new Date().toISOString();
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN updated_at TEXT DEFAULT '${now}';`);
      }
    };

    // Apply sync columns to core entities safely via ALTER TABLE mappings.
    await addSyncColumnsToTable('tenants');

    const tenantsWithFloat = await database.getAllAsync<{ tenant_id: number, credit_balance: number }>(
      `SELECT tenant_id, credit_balance FROM tenants WHERE credit_balance != ROUND(credit_balance)`
    );
    for (const t of tenantsWithFloat) {
      await database.runAsync(
        `UPDATE tenants SET credit_balance = ROUND(credit_balance) WHERE tenant_id = ?`,
        [t.tenant_id]
      );
    }

    await addSyncColumnsToTable('payments');
    await addSyncColumnsToTable('reminders');
    await addSyncColumnsToTable('ledger_entries');
    await addSyncColumnsToTable('settings');
    await addSyncColumnsToTable('payment_cancellations'); 
    await addSyncColumnsToTable('sync_queue', false);
    await addSyncColumnsToTable('operation_logs', false);

    // LEDGER ENTRIES BACKFILL MIGRATION
    const ledgerTableInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(ledger_entries)"
    );
    
    if (ledgerTableInfo.length > 0) {
      const entryCountRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM ledger_entries");
      if (entryCountRow && entryCountRow.count === 0) {
        console.log('🔄 Running migration: Backfilling ledger_entries with initial balances...');
        
        const existingTenants = await database.getAllAsync<{ tenant_id: number, credit_balance: number, start_date: string }>(
          "SELECT tenant_id, credit_balance, start_date FROM tenants"
        );
        
        for (const tenant of existingTenants) {
          // If credit_balance is null or 0, we can still write a 0 balance or just a 0 entry.
          const balance = tenant.credit_balance ? Math.round(tenant.credit_balance) : 0;
          await database.runAsync(
            `INSERT INTO ledger_entries (tenant_id, type, amount, description, reference_date) VALUES (?, ?, ?, ?, ?)`,
            [tenant.tenant_id, 'INITIAL_BALANCE', balance, 'Migrated starting balance', tenant.start_date.split('T')[0]]
          );
        }
        console.log('✅ Migration completed: Ledger entries backfilled.');
      }
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw new DatabaseError("Failed to update the database structure.");
  }
};

// --- CRITICAL FIX: Safe Initialization ---
export const initializeDatabase = async (): Promise<void> => {
  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log('🔄 Initializing database...');
      
      if (!db) {
        db = await openSharedDb();
        console.log('✅ Database connection opened');
      }

      await db.execAsync('BEGIN TRANSACTION;');
      await db.execAsync('PRAGMA foreign_keys = ON;');

      // Tenants Table: room_number is UNIQUE to prevent duplicates.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS tenants (
          tenant_id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          room_number TEXT NOT NULL,
          start_date TEXT NOT NULL,
          contract_end_date TEXT,
          monthly_rent REAL NOT NULL,
          rent_cycle TEXT DEFAULT 'monthly',
          status TEXT DEFAULT 'Due Soon',
          credit_balance INTEGER DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          version INTEGER DEFAULT 1,
          is_dirty INTEGER DEFAULT 0,
          deleted_at TEXT DEFAULT NULL,
          user_id TEXT NOT NULL,
          UNIQUE(room_number, user_id)
        );
      `);

      // Payments Table - Create with NEW columns included
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS payments (
          payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          amount_paid REAL NOT NULL,
          months_paid_for REAL NOT NULL, 
          payment_date TEXT NOT NULL,
          next_due_date TEXT NOT NULL,
          payment_method TEXT DEFAULT 'Cash',
          rent_amount_at_payment REAL,
          rent_cycle_at_payment TEXT,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          version INTEGER DEFAULT 1,
          is_dirty INTEGER DEFAULT 0,
          deleted_at TEXT DEFAULT NULL,
          user_id TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id) ON DELETE CASCADE
        );
      `);

      // Reminders Table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS reminders (
          reminder_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          due_date TEXT NOT NULL,
          reminder_date TEXT NOT NULL,
          status TEXT DEFAULT 'Pending',
          message TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          version INTEGER DEFAULT 1,
          is_dirty INTEGER DEFAULT 0,
          deleted_at TEXT DEFAULT NULL,
          user_id TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id) ON DELETE CASCADE
        );
      `);

      // Settings Table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
          reminder_days_before_due INTEGER DEFAULT 3,
          reminder_time TEXT DEFAULT '09:00',
          notification_enabled INTEGER DEFAULT 1,
          currency TEXT DEFAULT 'UGX',
          theme TEXT DEFAULT 'Light',
          auto_suspend_days INTEGER DEFAULT 30,
          contract_reminder_days INTEGER DEFAULT 60,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          version INTEGER DEFAULT 1,
          is_dirty INTEGER DEFAULT 0,
          user_id TEXT NOT NULL
        );
      `);

      // Payment Cancellations Table (NEW)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS payment_cancellations (
          cancellation_id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_payment_id INTEGER NOT NULL,
          tenant_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          reason TEXT,
          cancelled_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          version INTEGER DEFAULT 1,
          is_dirty INTEGER DEFAULT 0,
          user_id TEXT NOT NULL
        );
      `);

      // Ledger Entries Table (NEW: Append-Only Financial Immutability)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ledger_entries (
          entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          type TEXT NOT NULL, 
          amount REAL NOT NULL, 
          description TEXT NOT NULL,
          reference_date TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          original_payment_id INTEGER,
          version INTEGER DEFAULT 1,
          is_dirty INTEGER DEFAULT 0,
          user_id TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id) ON DELETE CASCADE
        );
      `);

      // Sync Queue Table (NEW: Buffers offline mutations)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          operation TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          sync_attempts INTEGER DEFAULT 0,
          last_error TEXT,
          user_id TEXT NOT NULL
        );
      `);

      // Operation Logs (NEW: Local audit timeline)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS operation_logs (
          log_id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          timestamp TEXT DEFAULT (datetime('now')),
          user_id TEXT NOT NULL
        );
      `);

      // Sync Metadata Table (NEW: Tracks last sync timestamp)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          user_id TEXT PRIMARY KEY,
          last_sync_at TEXT NOT NULL
        );
      `);

      // Run migrations AFTER tables are created but BEFORE indexes
      await runMigrations(db);

      // Performance Indexes (NEW: Phase 3)
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_tenants_user_deleted ON tenants(user_id, deleted_at);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_payments_tenant_user ON payments(tenant_id, user_id);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_ledger_tenant_user ON ledger_entries(tenant_id, user_id);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);`);
      
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);`);

      // Update existing tenants to set default contract_end_date if NULL
      const tenantsWithNullContract = await db.getAllAsync<{ tenant_id: number; start_date: string }>(
        'SELECT tenant_id, start_date FROM tenants WHERE contract_end_date IS NULL AND deleted_at IS NULL'
      );
      
      for (const tenant of tenantsWithNullContract) {
        const defaultContractEnd = addMonths(parseISO(tenant.start_date), 12);
        await db.runAsync(
          'UPDATE tenants SET contract_end_date = ? WHERE tenant_id = ?',
          [format(defaultContractEnd, 'yyyy-MM-dd'), tenant.tenant_id]
        );
      }

      // Backfill rent_amount_at_payment for existing payments
      const paymentsWithoutRentAmount = await db.getAllAsync<{ 
        payment_id: number; 
        tenant_id: number;
        monthly_rent: number;
        rent_cycle: string;
      }>(
        `SELECT p.payment_id, p.tenant_id, t.monthly_rent, t.rent_cycle 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         WHERE p.rent_amount_at_payment IS NULL`
      );
      
      for (const payment of paymentsWithoutRentAmount) {
        await db.runAsync(
          'UPDATE payments SET rent_amount_at_payment = ?, rent_cycle_at_payment = ? WHERE payment_id = ?',
          [payment.monthly_rent, payment.rent_cycle || 'monthly', payment.payment_id]
        );
      }

      const settingsCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM settings');
      if (settingsCount && settingsCount.count === 0) {
        await db.runAsync(
          `INSERT INTO settings (reminder_days_before_due, reminder_time, notification_enabled, currency, theme, auto_suspend_days, contract_reminder_days) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [3, '09:00', 1, 'UGX', 'Light', 30, 60]
        );
      }

      // --- Migration: Fix room_number uniqueness (Multi-tenancy fix) ---
      const tableInfo = await db.getAllAsync<{ name: string, pk: number, unique: number }>('PRAGMA table_info(tenants)');
      const roomNumCol = tableInfo.find(c => c.name === 'room_number');
      // In SQLite table_info, 'unique' isn't directly shown, so we check index_list
      const indexList = await db.getAllAsync<{ name: string, unique: number, origin: string }>('PRAGMA index_list(tenants)');
      const hasGlobalUnique = indexList.some(idx => idx.unique === 1 && !idx.name.includes('idx_tenants_room_user'));
      
      if (hasGlobalUnique) {
        console.log('🔄 Migration: Fixing tenants unique constraint for multi-tenancy...');
        await db.execAsync('PRAGMA foreign_keys = OFF;');
        await db.execAsync('ALTER TABLE tenants RENAME TO tenants_old;');
        await db.execAsync(`
          CREATE TABLE tenants (
            tenant_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            room_number TEXT NOT NULL,
            start_date TEXT NOT NULL,
            contract_end_date TEXT,
            monthly_rent REAL NOT NULL,
            rent_cycle TEXT DEFAULT 'monthly',
            status TEXT DEFAULT 'Due Soon',
            credit_balance INTEGER DEFAULT 0,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            version INTEGER DEFAULT 1,
            is_dirty INTEGER DEFAULT 0,
            deleted_at TEXT DEFAULT NULL,
            user_id TEXT NOT NULL,
            UNIQUE(room_number, user_id)
          );
        `);
        await db.execAsync('INSERT INTO tenants SELECT * FROM tenants_old;');
        await db.execAsync('DROP TABLE tenants_old;');
        await db.execAsync('PRAGMA foreign_keys = ON;');
        console.log('✅ Migration: Tenants table updated successfully');
      }

      await db.execAsync('COMMIT;');
      console.log('✅ Database initialized successfully');
    } catch (error) {
      if (db) {
        await db.execAsync('ROLLBACK;');
      }
      console.error('❌ Database initialization error:', error);
      initializationPromise = null;
      db = null; // Reset database connection
      throw error;
    }
  })();

  return initializationPromise;
};

// --- Database Public API ---
export const Database = {
  getDb: getDb,

  /**
   * Aggregates ledger entries by ISO month for the Tax Summary PDF template.
   */
  getLedgerSummary: async (fromDate: string, toDate: string, userId: string) => {
    try {
      const database = getDb();
      // SQLite strftime('%Y-%m') extracts the year-month chunk naturally
      const result = await database.getAllAsync<{
        month: string;
        income: number;
        charges: number;
      }>(
        `SELECT 
           strftime('%Y-%m', reference_date) as month,
           SUM(CASE WHEN type = 'RENT_PAYMENT' THEN amount ELSE 0 END) as income,
           SUM(CASE WHEN type IN ('RENT_CHARGE', 'INITIAL_BALANCE') THEN amount ELSE 0 END) as charges
         FROM ledger_entries
         WHERE reference_date >= ? AND reference_date <= ? AND user_id = ?
         GROUP BY month
         ORDER BY month ASC`,
        [fromDate, toDate, userId]
      );
      
      return result.map(r => ({
        month: r.month,
        income: r.income || 0,
        charges: r.charges || 0,
      }));
    } catch (error) {
      console.error('❌ Error getting ledger summary:', error);
      throw new DatabaseError("Could not fetch ledger summary.");
    }
  },

  getAllTenants: async (userId: string): Promise<Tenant[]> => {
    try {
      const database = getDb();
      // Optimized: Calculate credit_balance via LEFT JOIN to avoid N+1 queries
      const tenants = await database.getAllAsync<Tenant>(`
        SELECT t.*, COALESCE(SUM(l.amount), 0) as credit_balance
        FROM tenants t
        LEFT JOIN ledger_entries l ON t.tenant_id = l.tenant_id AND t.user_id = l.user_id
        WHERE t.deleted_at IS NULL AND t.user_id = ?
        GROUP BY t.tenant_id
        ORDER BY t.name COLLATE NOCASE
      `, [userId]);
      
      return tenants;
    } catch (error) {
      console.error('❌ Error getting all tenants:', error);
      throw new DatabaseError("Could not fetch tenant list.");
    }
  },

  getTenant: async (tenantId: number, userId: string): Promise<Tenant | null> => {
    try {
      const database = getDb();
      const tenant = await database.getFirstAsync<Tenant>('SELECT * FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL', [tenantId, userId]);
      if (tenant) {
        const balanceRow = await database.getFirstAsync<{ balance: number }>(
          'SELECT SUM(amount) as balance FROM ledger_entries WHERE tenant_id = ? AND user_id = ?',
          [tenantId, userId]
        );
        tenant.credit_balance = balanceRow?.balance || 0;
      }
      return tenant;
    } catch (error) {
      console.error(`❌ Error getting tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant details.");
    }
  },
  
  checkRoomExists: async (roomNumber: string, userId: string, excludeTenantId?: number): Promise<boolean> => {
    try {
      const database = getDb();
      let query = 'SELECT 1 FROM tenants WHERE room_number = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1';
      const params: (string | number)[] = [roomNumber, userId];
      if (excludeTenantId) {
        query = 'SELECT 1 FROM tenants WHERE room_number = ? AND user_id = ? AND tenant_id != ? AND deleted_at IS NULL LIMIT 1';
        params.push(excludeTenantId);
      }
      const result = await database.getFirstAsync<any>(query, params);
      return !!result;
    } catch (error) {
      console.error('❌ Error in checkRoomExists:', error);
      throw new DatabaseError('Unable to verify room availability.');
    }
  },

  fixPaymentCalculations: async (userId: string): Promise<void> => {
    try {
      const database = getDb();
      console.log('🔄 Fixing payment calculations...');
      await database.execAsync('BEGIN TRANSACTION');
      
      const tenants = await database.getAllAsync<Tenant>('SELECT * FROM tenants WHERE deleted_at IS NULL AND user_id = ?', [userId]);
      
      for (const tenant of tenants) {
        const payments = await database.getAllAsync<Payment>(
          'SELECT * FROM payments WHERE tenant_id = ? AND user_id = ? ORDER BY payment_date ASC, payment_id ASC',
          [tenant.tenant_id, userId]
        );
        
        let runningCredit = 0;
        let currentDueDate = parseISO(tenant.start_date);
        
        for (const payment of payments) {
          const breakdown = calculatePaymentBreakdown(
            payment.amount_paid,
            runningCredit,
            tenant.monthly_rent,
            currentDueDate,
            tenant.rent_cycle || 'monthly'
          );
          
          runningCredit = breakdown.newCreditBalance;
          currentDueDate = breakdown.nextDueDate;
          const newDueDateStr = format(currentDueDate, 'yyyy-MM-dd');
          
          await database.runAsync(
            'UPDATE payments SET months_paid_for = ?, next_due_date = ? WHERE payment_id = ?',
            [breakdown.fullCyclesCovered, newDueDateStr, payment.payment_id]
          );
        }
        
        const finalStatus = calculateTenantStatus(format(currentDueDate, 'yyyy-MM-dd'), payments.length > 0);
        await database.runAsync(
          'UPDATE tenants SET credit_balance = ?, status = ? WHERE tenant_id = ?',
          [runningCredit, finalStatus, tenant.tenant_id]
        );
      }
      
      await database.execAsync('COMMIT');

      // Rebuild each tenant's ledger to ensure the cache matches the source of truth
      for (const tenant of tenants) {
        await Database.syncTenantLedger(tenant.tenant_id, userId);
      }

      console.log('✅ Payment calculations fixed successfully');
    } catch (error) {
      const database = getDb();
      await database.execAsync('ROLLBACK');
      console.error('❌ Error fixing payment calculations:', error);
      throw error;
    }
  },

  addTenant: async (userId: string, tenant: {
    name: string;
    phone: string;
    roomNumber: string;
    startDate: string;
    contractEndDate: string;
    monthlyRent: number;
    rentCycle: 'monthly' | 'biweekly' | 'quarterly';
    notes?: string;
  }): Promise<number> => {
    const database = getDb();
    const roomExists = await Database.checkRoomExists(tenant.roomNumber, userId);
    if (roomExists) {
      throw new RoomAlreadyExistsError(tenant.roomNumber);
    }

    if (tenant.monthlyRent <= 0) {
      throw new DatabaseError("Monthly rent must be greater than 0");
    }

    try {
      const firstDueDate = calculateNextDueDate(parseISO(tenant.startDate), tenant.rentCycle);
      const firstDueDateStr = format(firstDueDate, 'yyyy-MM-dd');
      
      const initialStatus = calculateTenantStatus(firstDueDateStr, false);

      const result = await database.runAsync(
        `INSERT INTO tenants (name, phone, room_number, start_date, contract_end_date, monthly_rent, rent_cycle, notes, status, user_id, is_dirty, version) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [
          tenant.name.trim(),
          tenant.phone.trim(),
          tenant.roomNumber.trim(),
          tenant.startDate,
          tenant.contractEndDate,
          assertInteger(tenant.monthlyRent),
          tenant.rentCycle,
          tenant.notes?.trim() || '',
          initialStatus,
          userId
        ]
      );
      
      const tenantId = result.lastInsertRowId;
      
      try {
        const { NotificationService } = await import('../services/notifications');
        await NotificationService.createReminder(tenantId, userId, firstDueDateStr);
      } catch (notifError) {
        console.warn('⚠️ Failed to create initial reminder:', notifError);
      }
      
      return tenantId;
    } catch (error) {
      console.error('❌ Error adding tenant:', error);
      if (error instanceof RoomAlreadyExistsError) {
        throw error;
      }
      throw new DatabaseError("Failed to save the new tenant.");
    }
  },

  updateTenant: async (tenantId: number, userId: string, updates: {
    name: string;
    phone: string;
    roomNumber: string;
    startDate: string;
    monthlyRent: number;
    rentCycle?: 'monthly' | 'biweekly' | 'quarterly';
    contractEndDate?: string;
    notes?: string;
  }): Promise<void> => {
    const database = getDb();
    const roomExists = await Database.checkRoomExists(updates.roomNumber, userId, tenantId);
    if (roomExists) {
      throw new RoomAlreadyExistsError(updates.roomNumber);
    }
    
    try {
      await database.runAsync(
        `UPDATE tenants 
         SET name = ?, phone = ?, room_number = ?, start_date = ?, monthly_rent = ?, rent_cycle = ?, contract_end_date = ?, notes = ?, updated_at = datetime('now'), is_dirty = 1, version = version + 1
         WHERE tenant_id = ? AND user_id = ?`,
        [
          updates.name.trim(),
          updates.phone.trim(),
          updates.roomNumber.trim(),
          updates.startDate,
          assertInteger(updates.monthlyRent),
          updates.rentCycle || 'monthly',
          updates.contractEndDate || null,
          updates.notes?.trim() || '',
          tenantId,
          userId
        ]
      );
    } catch (error) {
      console.error(`❌ Error updating tenant ${tenantId}:`, error);
      throw new DatabaseError("Failed to save tenant updates.");
    }
  },

  deleteTenant: async (tenantId: number, userId: string): Promise<void> => {
    try {
      const database = getDb();
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(tenantId, userId);
      await database.runAsync("UPDATE tenants SET deleted_at = datetime('now'), updated_at = datetime('now'), is_dirty = 1, version = version + 1 WHERE tenant_id = ? AND user_id = ?", [tenantId, userId]);
    } catch (error) {
      console.error(`❌ Error deleting tenant ${tenantId}:`, error);
      throw new DatabaseError("Failed to delete the tenant.");
    }
  },

  syncTenantLedger: async (tenantId: number, userId: string): Promise<void> => {
    try {
      const database = getDb();
      const tenant = await database.getFirstAsync<Tenant>('SELECT * FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL', [tenantId, userId]);
      if (!tenant) return;

      // 1. Get last charge date
      const lastCharge = await database.getFirstAsync<{ reference_date: string }>(
        "SELECT reference_date FROM ledger_entries WHERE tenant_id = ? AND type IN ('RENT_CHARGE', 'INITIAL_BALANCE') ORDER BY reference_date DESC LIMIT 1",
        [tenantId]
      );
      
      const lastChargeDateStr = lastCharge?.reference_date || tenant.start_date.split('T')[0];

      // 2. Generate missing charges up to today
      const { generateMissingRentCharges, calculateStatusFromLedger } = await import('../domain/ledger');
      const { calculateNextDueDate } = await import('../domain/financial');
      
      const newCharges = generateMissingRentCharges(
        tenantId, 
        tenant.monthly_rent, 
        tenant.rent_cycle || 'monthly', 
        lastChargeDateStr
      );

      if (newCharges.length > 0) {
        for (const charge of newCharges) {
          await database.runAsync(
            "INSERT INTO ledger_entries (tenant_id, type, amount, description, reference_date, user_id, is_dirty, version) VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
            [charge.tenant_id, charge.type, charge.amount, charge.description, charge.reference_date, userId]
          );
        }
      }

      // 3. Re-calculate balance and status
      const balanceRow = await database.getFirstAsync<{ balance: number }>(
        'SELECT SUM(amount) as balance FROM ledger_entries WHERE tenant_id = ? AND user_id = ?',
        [tenantId, userId]
      );
      const currentBalance = balanceRow?.balance || 0;

      // Find next predicted charge date by looking at our latest ledger charge
      const latestCharge = await database.getFirstAsync<{ reference_date: string }>(
        "SELECT reference_date FROM ledger_entries WHERE tenant_id = ? AND type IN ('RENT_CHARGE', 'INITIAL_BALANCE') ORDER BY reference_date DESC LIMIT 1",
        [tenantId]
      );
      const baseDate = latestCharge?.reference_date || tenant.start_date;
      const nextChargeDate = calculateNextDueDate(new Date(baseDate), tenant.rent_cycle || 'monthly');

      const newStatus = calculateStatusFromLedger(currentBalance, nextChargeDate.toISOString());

      if (newStatus !== tenant.status) {
        await database.runAsync('UPDATE tenants SET status = ?, updated_at = datetime("now"), is_dirty = 1, version = version + 1 WHERE tenant_id = ? AND user_id = ?', [newStatus, tenantId, userId]);
        console.log(`✅ Status for ${tenant.name} updated to ${newStatus}`);
      }
    } catch (error) {
      console.error(`❌ Error syncing tenant ledger for ${tenantId}:`, error);
    }
  },

  updateAllTenantStatuses: async (userId: string): Promise<void> => {
    console.log('🔄 Updating all tenant statuses and ledgers...');
    try {
      const database = getDb();
      const tenants = await database.getAllAsync<Tenant>('SELECT * FROM tenants WHERE deleted_at IS NULL AND user_id = ?', [userId]);
      
      for (const tenant of tenants) {
        await Database.syncTenantLedger(tenant.tenant_id, userId);
      }
      
      console.log('✅ Tenant status update completed successfully');
    } catch (error) {
      
      console.error('❌ Fatal error during tenant status update:', error);
      throw new DatabaseError("Failed to update tenant statuses.");
    }
  },

  recordPayment: async (userId: string, payment: {
    tenantId: number;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: string;
    notes?: string;
  }): Promise<{ 
    paymentId: number; 
    shouldAlertPartial: boolean; 
    alertMessage?: string;
    warnings?: string[];
  }> => {
    try {
      const database = getDb();
      await database.execAsync('BEGIN TRANSACTION');
      const warnings: string[] = [];

      const tenant = await database.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL',
        [payment.tenantId, userId]
      );
      if (!tenant) throw new Error('Tenant not found');

      const lastPayment = await database.getFirstAsync<{ 
        next_due_date: string;
        payment_date: string;
      }>(
        `SELECT next_due_date, payment_date 
         FROM payments 
         WHERE tenant_id = ? AND user_id = ?
         ORDER BY payment_date DESC, payment_id DESC 
         LIMIT 1`,
        [payment.tenantId, userId]
      );

      let baseDate: Date;
      if (lastPayment) {
        baseDate = parseISO(lastPayment.next_due_date);
        
        if (payment.paymentDate < lastPayment.payment_date) {
          warnings.push(
            `⚠️ This payment is dated ${payment.paymentDate} but the last payment was ${lastPayment.payment_date}. ` +
            `Next due date will calculate from ${lastPayment.next_due_date}.`
          );
        }
      } else {
        baseDate = parseISO(tenant.start_date);
      }

      const currentRent = tenant.monthly_rent;
      
      const breakdown = calculatePaymentBreakdown(
        payment.amountPaid,
        tenant.credit_balance || 0,
        currentRent,
        baseDate,
        tenant.rent_cycle || 'monthly'
      );
      
      const nextDueDateStr = format(breakdown.nextDueDate, 'yyyy-MM-dd');

      const result = await database.runAsync(
        `INSERT INTO payments (
          tenant_id, 
          amount_paid, 
          months_paid_for, 
          payment_date, 
          next_due_date, 
          payment_method, 
          notes,
          rent_amount_at_payment,
          rent_cycle_at_payment,
          user_id,
          is_dirty,
          version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [
          payment.tenantId,
          assertInteger(payment.amountPaid),
          breakdown.fullCyclesCovered,
          payment.paymentDate,
          nextDueDateStr,
          payment.paymentMethod,
          payment.notes || '',
          currentRent,
          tenant.rent_cycle || 'monthly',
          userId
        ]
      );

      // INSERT INTO ledger_entries to make payment immutable and affect balance
      await database.runAsync(
        `INSERT INTO ledger_entries (tenant_id, type, amount, description, reference_date, original_payment_id, user_id, is_dirty, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [payment.tenantId, 'PAYMENT', assertInteger(payment.amountPaid), 'Rent Payment', payment.paymentDate, result.lastInsertRowId, userId]
      );

      // Re-evaluate the tenant's ledger and update status cache
      await Database.syncTenantLedger(payment.tenantId, userId);

      try {
        const { NotificationService } = await import('../services/notifications');
        // Will need to decouple reminders later
        // await NotificationService.cancelReminders(payment.tenantId);
        // await NotificationService.createReminder(payment.tenantId, nextDueDateStr);
      } catch (notifError) {
        console.warn('⚠️ Failed to update reminders:', notifError);
        warnings.push('Reminder notification update failed');
      }
      
      await database.execAsync('COMMIT');

      let shouldAlertPartial = false;
      let alertMessage = '';
      
      if (breakdown.balanceDueForCurrentCycle > 0) {
        shouldAlertPartial = true;
        alertMessage = 
          `Payment of ${payment.amountPaid.toLocaleString()} UGX recorded. ` +
          `Credit balance: ${breakdown.newCreditBalance.toLocaleString()} UGX. ` +
          `Does not cover a full period (${currentRent.toLocaleString()} UGX needed).`;
      } else if (breakdown.newCreditBalance > 0 && breakdown.newCreditBalance < currentRent) {
        shouldAlertPartial = true;
        alertMessage = 
          `Partial payment surplus recorded. Credit balance: ${breakdown.newCreditBalance.toLocaleString()} UGX. ` +
          `Full payment: ${currentRent.toLocaleString()} UGX.`;
      }
      
      return {
        paymentId: result.lastInsertRowId,
        shouldAlertPartial,
        alertMessage,
        warnings: warnings.length > 0 ? warnings : undefined
      };
      
    } catch (error) {
      const database = getDb();
      await database.execAsync('ROLLBACK');
      console.error('❌ Error recording payment:', error);
      throw new DatabaseError(
        "The payment could not be recorded. No changes were made. " +
        (error instanceof Error ? error.message : '')
      );
    }
  },

  cancelPayment: async (paymentId: number, userId: string, reason: string): Promise<void> => {
    try {
      const database = getDb();
      await database.execAsync('BEGIN TRANSACTION');
      
      const payment = await database.getFirstAsync<Payment & { tenant_name: string }>(
        `SELECT p.*, t.name as tenant_name 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         WHERE p.payment_id = ? AND p.user_id = ?`,
        [paymentId, userId]
      );
      
      if (!payment) throw new Error('Payment not found');
      
      const tenant = await database.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL',
        [payment.tenant_id, userId]
      );
      if (!tenant) throw new Error('Tenant not found');
      
      const isLastPayment = await database.getFirstAsync<{ is_last: number }>(
        `SELECT (payment_id = ?) as is_last 
         FROM payments 
         WHERE tenant_id = ? AND user_id = ?
         ORDER BY next_due_date DESC, payment_id DESC 
         LIMIT 1`,
        [paymentId, payment.tenant_id, userId]
      );
      
      if (!isLastPayment?.is_last) {
        throw new Error(
          'Can only cancel the most recent payment. ' +
          'Cancelling older payments would corrupt the payment history.'
        );
      }
      
      await database.runAsync('DELETE FROM payments WHERE payment_id = ? AND user_id = ?', [paymentId, userId]);
      
      await database.runAsync(
        `INSERT INTO ledger_entries (tenant_id, type, amount, description, reference_date, original_payment_id, user_id, is_dirty, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [payment.tenant_id, 'REVERSAL', -payment.amount_paid, `Reversal: ${reason}`, new Date().toISOString().split('T')[0], paymentId, userId]
      );
      
      await Database.syncTenantLedger(payment.tenant_id, userId);
      
      await database.runAsync(
        `INSERT INTO payment_cancellations (
          original_payment_id, tenant_id, amount, reason, cancelled_at, user_id
        ) VALUES (?, ?, ?, ?, datetime('now'), ?)`,
        [paymentId, payment.tenant_id, payment.amount_paid, reason, userId]
      );
      
      await database.execAsync('COMMIT');
      console.log(`✅ Payment ${paymentId} cancelled: ${reason}`);
      
    } catch (error) {
      const database = getDb();
      await database.execAsync('ROLLBACK');
      console.error('❌ Error cancelling payment:', error);
      throw new DatabaseError(
        "Failed to cancel payment. " + 
        (error instanceof Error ? error.message : '')
      );
    }
  },

  runSystemHeartbeat: async (userId: string): Promise<{
    statusUpdates: number;
    suspensionAlerts: string[];
    contractAlerts: string[];
  }> => {
    console.log(`💓 Running system heartbeat for user ${userId}...`);
    const results = {
      statusUpdates: 0,
      suspensionAlerts: [] as string[],
      contractAlerts: [] as string[]
    };

    try {
      const database = getDb();
      const settings = await Database.getSettings(userId);
      const tenants = await database.getAllAsync<Tenant>('SELECT * FROM tenants WHERE deleted_at IS NULL AND user_id = ?', [userId]);
      const today = new Date();

      for (const tenant of tenants) {
        try {
          const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, tenant.user_id, database);
          const hasPayments = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ? AND user_id = ?',
            [tenant.tenant_id, tenant.user_id]
          );
          
          const currentStatus = calculateTenantStatus(nextDueDate, (hasPayments?.count || 0) > 0, today);

          if (currentStatus !== tenant.status) {
            await database.runAsync(
              'UPDATE tenants SET status = ?, updated_at = datetime("now"), is_dirty = 1, version = version + 1 WHERE tenant_id = ? AND user_id = ?',
              [currentStatus, tenant.tenant_id, userId]
            );
            results.statusUpdates++;
            console.log(`✅ Status updated for ${tenant.name}: ${tenant.status} → ${currentStatus}`);
          }
        } catch (tenantError) {
          console.error(`❌ Error updating tenant ${tenant.tenant_id}:`, tenantError);
        }
      }

      if (settings) {
        for (const tenant of tenants) {
          if (tenant.status === 'Overdue') {
            try {
              const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, tenant.user_id, database);
              const dueDate = parseISO(nextDueDate);
              const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysOverdue > (settings.auto_suspend_days || 30)) {
                await database.runAsync(
                  'UPDATE tenants SET status = ?, updated_at = datetime("now"), is_dirty = 1, version = version + 1 WHERE tenant_id = ? AND user_id = ?',
                  ['Suspended', tenant.tenant_id, userId]
                );
                
                const alertMsg = `Action Required: ${tenant.name} in Room ${tenant.room_number} is over ${settings.auto_suspend_days} days late. Account flagged for suspension.`;
                results.suspensionAlerts.push(alertMsg);
                console.log(`🚨 Auto-suspended: ${tenant.name}`);
              }
            } catch (error) {
              console.error(`❌ Error processing suspension for tenant ${tenant.tenant_id}:`, error);
            }
          }
        }

        const contractReminderDays = settings.contract_reminder_days || 60;
        const reminderThreshold = addDays(today, contractReminderDays);
        
        for (const tenant of tenants) {
          try {
            if (!tenant.contract_end_date) {
              console.warn(`Tenant ${tenant.tenant_id} has no contract_end_date`);
              continue;
            }
            
            const contractEnd = parseISO(tenant.contract_end_date);
            if (contractEnd <= reminderThreshold && contractEnd >= today) {
              const daysUntilEnd = Math.ceil((contractEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const alertMsg = `${tenant.name}'s contract expires on ${format(contractEnd, 'MMM dd, yyyy')} (in ${daysUntilEnd} days).`;
              results.contractAlerts.push(alertMsg);
            }
          } catch (error) {
            console.error(`❌ Error processing contract for tenant ${tenant.tenant_id}:`, error);
          }
        }
      }

      console.log('✅ System heartbeat completed successfully');
      return results;
    } catch (error) {
      
      console.error('❌ Fatal error during system heartbeat:', error);
      throw new DatabaseError("Failed to run system audit.");
    }
  },

  getPaymentHistory: async (tenantId: number, userId: string): Promise<Payment[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Payment>(
        `SELECT * FROM payments 
         WHERE tenant_id = ? AND user_id = ?
         ORDER BY payment_date DESC, payment_id DESC`,
        [tenantId, userId]
      );
    } catch (error) {
      console.error(`❌ Error getting payment history for tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch payment history.");
    }
  },

  getPaymentById: async (paymentId: number, userId: string): Promise<Payment | null> => {
    try {
      const database = getDb();
      return await database.getFirstAsync<Payment>(
        'SELECT * FROM payments WHERE payment_id = ? AND user_id = ?',
        [paymentId, userId]
      );
    } catch (error) {
      console.error(`❌ Error getting payment ${paymentId}:`, error);
      throw new DatabaseError("Could not fetch payment record.");
    }
  },

  getSettings: async (userId: string): Promise<Settings> => {
    try {
      const database = getDb();
      const settings = await database.getFirstAsync<Settings>('SELECT * FROM settings WHERE user_id = ? LIMIT 1', [userId]);
      return settings || {
        setting_id: 0,
        reminder_days_before_due: 3,
        reminder_time: '09:00',
        notification_enabled: 1,
        currency: 'UGX',
        theme: 'Light',
        auto_suspend_days: 30,
        contract_reminder_days: 60,
        user_id: userId,
        is_dirty: 0,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Error getting settings:', error);
      return {
        setting_id: 0,
        reminder_days_before_due: 3,
        reminder_time: '09:00',
        notification_enabled: 1,
        currency: 'UGX',
        theme: 'Light',
        auto_suspend_days: 30,
        contract_reminder_days: 60,
        user_id: userId,
        is_dirty: 0,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  },

  updateSettings: async (userId: string, settings: Partial<Settings>): Promise<void> => {
    try {
      const database = getDb();
      const currentSettings = await Database.getSettings(userId);
      
      if (currentSettings) {
        await database.runAsync(
          `UPDATE settings 
           SET reminder_days_before_due = ?, reminder_time = ?, notification_enabled = ?, 
               currency = ?, theme = ?, auto_suspend_days = ?, contract_reminder_days = ?, is_dirty = 1, version = version + 1
           WHERE setting_id = ? AND user_id = ?`,
          [
            settings.reminder_days_before_due ?? currentSettings.reminder_days_before_due,
            settings.reminder_time ?? currentSettings.reminder_time,
            settings.notification_enabled ? 1 : 0,
            settings.currency ?? currentSettings.currency,
            settings.theme ?? currentSettings.theme,
            settings.auto_suspend_days ?? currentSettings.auto_suspend_days,
            settings.contract_reminder_days ?? currentSettings.contract_reminder_days,
            currentSettings.setting_id,
            userId
          ]
        );
      } else {
        await database.runAsync(
          `INSERT INTO settings (
            reminder_days_before_due, reminder_time, notification_enabled, 
            currency, theme, auto_suspend_days, contract_reminder_days, user_id, is_dirty, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            settings.reminder_days_before_due ?? 3,
            settings.reminder_time ?? '09:00',
            settings.notification_enabled ? 1 : 0,
            settings.currency ?? 'UGX',
            settings.theme ?? 'Light',
            settings.auto_suspend_days ?? 30,
            settings.contract_reminder_days ?? 60,
            userId
          ]
        );
      }
    } catch (error) {
      console.error('❌ Error updating settings:', error);
      throw new DatabaseError("Failed to save settings.");
    }
  },

  getReminders: async (userId: string, tenantId?: number): Promise<Reminder[]> => {
    try {
      const database = getDb();
      if (tenantId) {
        return await database.getAllAsync<Reminder>(
          'SELECT * FROM reminders WHERE tenant_id = ? AND user_id = ? ORDER BY reminder_date DESC',
          [tenantId, userId]
        );
      } else {
        return await database.getAllAsync<Reminder>(
          'SELECT * FROM reminders WHERE user_id = ? ORDER BY reminder_date DESC',
          [userId]
        );
      }
    } catch (error) {
      console.error('❌ Error getting reminders:', error);
      throw new DatabaseError("Could not fetch reminders.");
    }
  },

  // NEW FUNCTION: Get upcoming reminders with tenant details
  getUpcomingReminders: async (userId: string, daysAhead: number = 30): Promise<Reminder[]> => {
    try {
      const database = getDb();
      const today = new Date();
      const futureDate = addDays(today, daysAhead);
      
      return await database.getAllAsync<Reminder>(
        `SELECT r.*, t.name, t.room_number 
         FROM reminders r 
         JOIN tenants t ON r.tenant_id = t.tenant_id 
         WHERE date(r.reminder_date) <= date(?) 
         AND r.status = 'Pending'
         AND r.user_id = ?
         ORDER BY r.reminder_date ASC`,
        [format(futureDate, 'yyyy-MM-dd'), userId]
      );
    } catch (error) {
      console.error('❌ Error getting upcoming reminders:', error);
      throw new DatabaseError("Could not fetch upcoming reminders.");
    }
  },

  // NEW FUNCTION: Get payment statistics
  getPaymentStats: async (userId: string): Promise<{
    totalCollected: number;
    thisMonth: number;
    lastMonth: number;
    overdueAmount: number;
  }> => {
    try {
      const database = getDb();
      const today = new Date();
      const thisMonthStart = startOfMonth(today);
      const thisMonthEnd = endOfMonth(today);
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      const lastMonthEnd = endOfMonth(subMonths(today, 1));

      // Use more accurate queries
    const [totalResult, thisMonthResult, lastMonthResult, overdueResult] = await Promise.all([
      database.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE user_id = ?',
        [userId]
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0) as total 
         FROM payments 
         WHERE date(payment_date) >= date(?) AND date(payment_date) <= date(?) AND user_id = ?`,
        [format(thisMonthStart, 'yyyy-MM-dd'), format(thisMonthEnd, 'yyyy-MM-dd'), userId]
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0) as total 
         FROM payments 
         WHERE date(payment_date) >= date(?) AND date(payment_date) <= date(?) AND user_id = ?`,
        [format(lastMonthStart, 'yyyy-MM-dd'), format(lastMonthEnd, 'yyyy-MM-dd'), userId]
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(monthly_rent), 0) as total 
         FROM tenants 
         WHERE status = 'Overdue' AND deleted_at IS NULL AND user_id = ? AND tenant_id IN (SELECT DISTINCT tenant_id FROM payments WHERE user_id = ?)`,
        [userId, userId]
      )
    ]);


      return {
        totalCollected: totalResult?.total || 0,
        thisMonth: thisMonthResult?.total || 0,
        lastMonth: lastMonthResult?.total || 0,
        overdueAmount: overdueResult?.total || 0
      };
    } catch (error) { 
      console.error('❌ Error getting payment stats:', error);
      throw new DatabaseError("Could not fetch payment statistics.");
    }
  },

// NEW FUNCTION: Recalculate payment statistics
recalculatePaymentStats: async (): Promise<void> => {
  try {
    const database = getDb();
    console.log('🔄 Recalculating payment statistics...');
    
    // This will force recalculation of all stats
    await database.execAsync('ANALYZE'); // SQLite optimization
    console.log('✅ Payment statistics recalculated');
  } catch (error) {
    console.error('❌ Error recalculating payment stats:', error);
  }
},

  // NEW FUNCTION: Get monthly payment trend
  getMonthlyTrend: async (userId: string): Promise<{ month: string; amount: number }[]> => {
    try {
      const database = getDb();
      const today = new Date();
      const sixMonthsAgo = subMonths(today, 5);

      const results = await database.getAllAsync<{ month: string; amount: number }>(
        `SELECT 
          strftime('%Y-%m', payment_date) as month,
          COALESCE(SUM(amount_paid), 0) as amount
         FROM payments
         WHERE date(payment_date) >= date(?) AND user_id = ?
         GROUP BY strftime('%Y-%m', payment_date)
         ORDER BY month ASC`,
        [format(sixMonthsAgo, 'yyyy-MM-dd'), userId]
      );

      // Format month names
      const formatted = results.map(row => ({
        month: format(parseISO(row.month + '-01'), 'MMM'),
        amount: row.amount
      }));

      // Fill in missing months with 0
      const allMonths: { month: string; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(today, i);
        const monthKey = format(monthDate, 'MMM');
        const existing = formatted.find(f => f.month === monthKey);
        allMonths.push({
          month: monthKey,
          amount: existing?.amount || 0
        });
      }

      return allMonths;
    } catch (error) {
      console.error('❌ Error getting monthly trend:', error);
      throw new DatabaseError("Could not fetch monthly payment trend.");
    }
  },

  getOverdueTenants: async (userId: string): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>(
        'SELECT * FROM tenants WHERE status = "Overdue" AND deleted_at IS NULL AND user_id = ? ORDER BY name COLLATE NOCASE',
        [userId]
      );
    } catch (error) {
      console.error('❌ Error getting overdue tenants:', error);
      throw new DatabaseError("Could not fetch overdue tenants.");
    }
  },

  getTenantsDueSoon: async (userId: string): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>(
        'SELECT * FROM tenants WHERE status = "Due Soon" AND deleted_at IS NULL AND user_id = ? ORDER BY name COLLATE NOCASE',
        [userId]
      );
    } catch (error) {
      console.error('❌ Error getting tenants due soon:', error);
      throw new DatabaseError("Could not fetch tenants due soon.");
    }
  },

  getPaidTenants: async (userId: string): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>(
        'SELECT * FROM tenants WHERE status = "Paid" AND deleted_at IS NULL AND user_id = ? ORDER BY name COLLATE NOCASE',
        [userId]
      );
    } catch (error) {
      console.error('❌ Error getting paid tenants:', error);
      throw new DatabaseError("Could not fetch paid tenants.");
    }
  },

  getTotalMonthlyRent: async (userId: string): Promise<number> => {
    try {
      const database = getDb();
      const result = await database.getFirstAsync<{ total: number }>(
        'SELECT SUM(monthly_rent) as total FROM tenants WHERE deleted_at IS NULL AND user_id = ?',
        [userId]
      );
      return result?.total || 0;
    } catch (error) {
      console.error('❌ Error getting total monthly rent:', error);
      throw new DatabaseError("Could not calculate total monthly rent.");
    }
  },

  getTotalCreditBalance: async (userId: string): Promise<number> => {
    try {
      const database = getDb();
      const result = await database.getFirstAsync<{ total: number }>(
        'SELECT SUM(credit_balance) as total FROM tenants WHERE deleted_at IS NULL AND user_id = ?',
        [userId]
      );
      return result?.total || 0;
    } catch (error) {
      console.error('❌ Error getting total credit balance:', error);
      throw new DatabaseError("Could not calculate total credit balance.");
    }
  },

  getDashboardStats: async (userId: string): Promise<{
    totalTenants: number;
    overdueTenants: number;
    dueSoonTenants: number;
    paidTenants: number;
    totalMonthlyRent: number;
    totalCreditBalance: number;
    collectionRate: number;
  }> => {
    try {
      const database = getDb();
      
      const [totalTenants, overdueTenants, dueSoonTenants, paidTenants, totalMonthlyRent, totalCreditBalance] = await Promise.all([
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE deleted_at IS NULL AND user_id = ?', [userId]),
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Overdue" AND deleted_at IS NULL AND user_id = ?', [userId]),
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Due Soon" AND deleted_at IS NULL AND user_id = ?', [userId]),
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Paid" AND deleted_at IS NULL AND user_id = ?', [userId]),
        database.getFirstAsync<{ total: number }>('SELECT SUM(monthly_rent) as total FROM tenants WHERE deleted_at IS NULL AND user_id = ?', [userId]),
        database.getFirstAsync<{ total: number }>('SELECT SUM(credit_balance) as total FROM tenants WHERE deleted_at IS NULL AND user_id = ?', [userId])
      ]);

      return {
        totalTenants: totalTenants?.count || 0,
        overdueTenants: overdueTenants?.count || 0,
        dueSoonTenants: dueSoonTenants?.count || 0,
        paidTenants: paidTenants?.count || 0,
        totalMonthlyRent: totalMonthlyRent?.total || 0,
        totalCreditBalance: totalCreditBalance?.total || 0,
        collectionRate: await Database.getCollectionRate(userId)
      };
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error);
      throw new DatabaseError("Could not fetch dashboard statistics.");
    }
  },

  getCollectionRate: async (userId: string): Promise<number> => {
    try {
      const database = getDb();
      const today = new Date();
      const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');

      const [paidResult, dueResult] = await Promise.all([
        database.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE date(payment_date) BETWEEN ? AND ? AND user_id = ?',
          [monthStart, monthEnd, userId]
        ),
        database.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(monthly_rent), 0) as total FROM tenants WHERE deleted_at IS NULL AND user_id = ?',
          [userId]
        )
      ]);

      const paid = paidResult?.total || 0;
      const due = dueResult?.total || 0;

      if (due === 0) return 100;
      return Math.min(100, Math.round((paid / due) * 100));
    } catch (error) {
      console.error('❌ Error calculating collection rate:', error);
      return 0;
    }
  },

  getRecentPayments: async (userId: string, limit: number = 10): Promise<Payment[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Payment>(
        `SELECT p.*, t.name as tenant_name, t.room_number 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         WHERE p.user_id = ?
         ORDER BY p.payment_date DESC, p.payment_id DESC 
         LIMIT ?`,
        [userId, limit]
      );
    } catch (error) {
      console.error('❌ Error getting recent payments:', error);
      throw new DatabaseError("Could not fetch recent payments.");
    }
  },

  searchTenants: async (userId: string, query: string): Promise<Tenant[]> => {
    try {
      const database = getDb();
      const searchTerm = `%${query}%`;
      return await database.getAllAsync<Tenant>(
        `SELECT * FROM tenants 
         WHERE (name LIKE ? OR room_number LIKE ? OR phone LIKE ?) AND deleted_at IS NULL AND user_id = ?
         ORDER BY name COLLATE NOCASE`,
        [searchTerm, searchTerm, searchTerm, userId]
      );
    } catch (error) {
      console.error('❌ Error searching tenants:', error);
      throw new DatabaseError("Could not search tenants.");
    }
  },

  getTenantWithDetails: async (tenantId: number, userId: string): Promise<{
    tenant: Tenant;
    payments: Payment[];
    reminders: Reminder[];
  } | null> => {
    try {
      const database = getDb();
      const tenant = await Database.getTenant(tenantId, userId);
      if (!tenant) return null;

      const [payments, reminders] = await Promise.all([
        Database.getPaymentHistory(tenantId, userId),
        Database.getReminders(userId, tenantId)
      ]);

      return { tenant, payments, reminders };
    } catch (error) {
      console.error(`❌ Error getting tenant details for ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant details.");
    }
  },

  // NEW FUNCTION: Get tenant statistics
  getTenantStats: async (tenantId: number, userId: string): Promise<{
    totalPaid: number;
    paymentsCount: number;
    averagePayment: number;
    lastPaymentDate: string | null;
    nextDueDate: string | null;
  }> => {
    try {
      const database = getDb();
      
      const statsResult = await database.getFirstAsync<{
        total: number;
        count: number;
        average: number;
      }>(
        `SELECT 
          COALESCE(SUM(amount_paid), 0) as total,
          COUNT(*) as count,
          COALESCE(AVG(amount_paid), 0) as average
         FROM payments 
         WHERE tenant_id = ? AND user_id = ?`,
        [tenantId, userId]
      );

      const lastPayment = await database.getFirstAsync<{ 
        payment_date: string;
        next_due_date: string;
      }>(
        `SELECT payment_date, next_due_date 
         FROM payments 
         WHERE tenant_id = ? AND user_id = ?
         ORDER BY payment_date DESC, payment_id DESC 
         LIMIT 1`,
        [tenantId, userId]
      );

      return {
        totalPaid: statsResult?.total || 0,
        paymentsCount: statsResult?.count || 0,
        averagePayment: statsResult?.average || 0,
        lastPaymentDate: lastPayment?.payment_date || null,
        nextDueDate: lastPayment?.next_due_date || null
      };
    } catch (error) {
      console.error(`❌ Error getting tenant stats for ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant statistics.");
    }
  },

  // Reset credit balance via a compensating ledger entry (preserves append-only invariant)
  resetCreditBalance: async (tenantId: number, userId: string): Promise<void> => {
    const database = getDb();
    try {
      await database.execAsync('BEGIN TRANSACTION');

      const tenant = await database.getFirstAsync<{ credit_balance: number }>(
        'SELECT credit_balance FROM tenants WHERE tenant_id = ? AND user_id = ?',
        [tenantId, userId]
      );
      if (!tenant) throw new DatabaseError('Tenant not found');

      const currentBalance = assertInteger(tenant.credit_balance);

      if (currentBalance !== 0) {
        // Insert a compensating entry so the ledger nets to zero
        const adjustmentAmount = -currentBalance;
        await database.runAsync(
          `INSERT INTO ledger_entries (tenant_id, type, amount, description, reference_date, user_id, is_dirty, version)
           VALUES (?, 'ADJUSTMENT', ?, 'Manual credit balance reset', date('now'), ?, 1, 1)`,
          [tenantId, adjustmentAmount, userId]
        );
      }

      // Recompute the cached credit_balance from the ledger
      await Database.syncTenantLedger(tenantId, userId);

      await database.execAsync('COMMIT');
      console.log(`✅ Credit balance reset with ledger entry for tenant ${tenantId}`);
    } catch (error) {
      await database.execAsync('ROLLBACK');
      const msg = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(`Could not reset credit balance: ${msg}`);
    }
  }
};

export default Database;