CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  company TEXT DEFAULT '',
  country TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS buyer_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER,
  product_keyword TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  max_budget_pkr REAL,
  target_price_pkr REAL,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER,
  requirement_id INTEGER,
  product_id INTEGER,
  product_title TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  delivery_address TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  requested_price_pkr REAL,
  max_budget_pkr REAL,
  request_type TEXT DEFAULT 'order_request',
  customer_note TEXT DEFAULT '',
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT DEFAULT 'internal',
  channel TEXT DEFAULT 'dashboard',
  recipient TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  message TEXT DEFAULT '',
  related_type TEXT DEFAULT '',
  related_id INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
