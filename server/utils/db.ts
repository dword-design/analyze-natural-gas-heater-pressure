import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

export interface EntitiesTable {
  id: string
  content: string
  created_time: Date
}

export interface Database {
  entities: EntitiesTable
}

let _db: Kysely<Database> | null = null

export function getDb(config: {
  dbHost: string
  dbName: string
  dbPassword: string
  dbPort: string
  dbUser: string
}): Kysely<Database> {
  if (_db) return _db

  if (!config.dbHost || !config.dbName || !config.dbUser) {
    throw new Error('Database runtime config is missing.')
  }

  const pool = new Pool({
    host: config.dbHost,
    database: config.dbName,
    password: config.dbPassword,
    port: Number(config.dbPort ?? '5432'),
    user: config.dbUser,
  })

  _db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  })

  return _db
}
