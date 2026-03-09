import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DB {
  query(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ insertId: number | bigint, changes: number }>;
  get(sql: string, params?: any[]): Promise<any>;
  transaction(callback: (tx: DB) => Promise<void>): Promise<void>;
  close(): Promise<void>;
  isMySQL: boolean;
}

class MySQLAdapter implements DB {
  private pool: mysql.Pool;
  public isMySQL = true;

  constructor(config: string | mysql.PoolOptions) {
    console.log('Creating MySQL pool...');
    this.pool = mysql.createPool(config);
    
    // Test connection
    this.pool.getConnection()
      .then(connection => {
        console.log('Successfully connected to MySQL');
        connection.release();
      })
      .catch(err => {
        console.error('Error connecting to MySQL:', err.message);
      });
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    const [rows] = await this.pool.execute(sql, params);
    return rows as any[];
  }

  async run(sql: string, params: any[] = []): Promise<{ insertId: number | bigint, changes: number }> {
    const [result] = await this.pool.execute(sql, params);
    const res = result as mysql.ResultSetHeader;
    return { insertId: res.insertId, changes: res.affectedRows };
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const [rows] = await this.pool.execute(sql, params);
    const r = rows as any[];
    return r.length > 0 ? r[0] : undefined;
  }

  async transaction(callback: (tx: DB) => Promise<void>): Promise<void> {
    const connection = await this.pool.getConnection();
    const txAdapter = new MySQLTransactionAdapter(connection);
    try {
      await connection.beginTransaction();
      await callback(txAdapter);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class MySQLTransactionAdapter implements DB {
    public isMySQL = true;
    constructor(private connection: mysql.PoolConnection) {}

    async query(sql: string, params: any[] = []): Promise<any[]> {
        const [rows] = await this.connection.execute(sql, params);
        return rows as any[];
    }

    async run(sql: string, params: any[] = []): Promise<{ insertId: number | bigint, changes: number }> {
        const [result] = await this.connection.execute(sql, params);
        const res = result as mysql.ResultSetHeader;
        return { insertId: res.insertId, changes: res.affectedRows };
    }

    async get(sql: string, params: any[] = []): Promise<any> {
        const [rows] = await this.connection.execute(sql, params);
        const r = rows as any[];
        return r.length > 0 ? r[0] : undefined;
    }

    async transaction(callback: (tx: DB) => Promise<void>): Promise<void> {
        await callback(this);
    }

    async close(): Promise<void> {
        // Do nothing
    }
}

class SQLiteAdapter implements DB {
  private db: Database.Database;
  public isMySQL = false;

  constructor(filename: string) {
    this.db = new Database(filename);
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    return this.db.prepare(sql).all(...params);
  }

  async run(sql: string, params: any[] = []): Promise<{ insertId: number | bigint, changes: number }> {
    const info = this.db.prepare(sql).run(...params);
    return { insertId: info.lastInsertRowid, changes: info.changes };
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    return this.db.prepare(sql).get(...params);
  }

  async transaction(callback: (tx: DB) => Promise<void>): Promise<void> {
    // SQLite transactions in better-sqlite3 are synchronous.
    // We can't easily wrap async logic in them.
    // For now, we just execute the callback directly.
    // This means no real transaction isolation for async SQLite operations,
    // but it allows the same code to run on both DBs.
    await callback(this);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function getDatabase(): DB {
  if (process.env.MYSQL_URL || process.env.DATABASE_URL) {
    const url = (process.env.MYSQL_URL || process.env.DATABASE_URL) as string;
    console.log('Connecting to MySQL via URL...');
    return new MySQLAdapter(url);
  } else if (process.env.MYSQLHOST) {
    console.log('Connecting to MySQL (Env Vars)...');
    return new MySQLAdapter({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: Number(process.env.MYSQLPORT) || 3306,
      ssl: { rejectUnauthorized: false },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  } else {
    // SQLite Fallback
    console.log('Connecting to SQLite...');
    let dbPath = process.env.DATABASE_PATH;
    let dbDir;

    if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
      dbDir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
      dbPath = path.join(dbDir, "destajos.db");
    } else if (dbPath) {
      dbDir = path.dirname(dbPath);
    } else {
      dbDir = process.env.NODE_ENV === "production" ? "/app/data" : __dirname;
      dbPath = path.join(dbDir, "destajos.db");
    }

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    return new SQLiteAdapter(dbPath);
  }
}
