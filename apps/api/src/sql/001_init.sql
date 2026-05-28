PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  total_area REAL NOT NULL,
  rentable_area REAL NOT NULL,
  warehouse_class TEXT NOT NULL CHECK (warehouse_class IN ('A+', 'A', 'B+', 'B', 'C', 'D')),
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  inn TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1,
  area REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('warm', 'cold', 'freezer', 'open', 'office')),
  status TEXT NOT NULL CHECK (status IN ('vacant', 'occupied', 'maintenance')),
  ceiling_height REAL DEFAULT 0,
  temperature_regime TEXT DEFAULT '',
  has_ramp INTEGER NOT NULL DEFAULT 0,
  has_gate INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(property_id, number)
);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL UNIQUE REFERENCES units(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'formed', 'sent', 'signed', 'active', 'prolongation', 'terminated')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  rate_per_sqm REAL NOT NULL,
  deposit REAL NOT NULL DEFAULT 0,
  indexation_pct REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'worker', 'tenant')),
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

