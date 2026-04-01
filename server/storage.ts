import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Storage interface — minimal since we use Supabase for reads/writes
export interface IStorage {}

export class DatabaseStorage implements IStorage {}

export const storage = new DatabaseStorage();
