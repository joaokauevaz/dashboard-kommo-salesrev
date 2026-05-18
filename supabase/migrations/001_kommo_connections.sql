-- =============================================
-- PSI Terapia - Kommo Dashboard Schema
-- =============================================

-- Kommo CRM Connection credentials
CREATE TABLE IF NOT EXISTS kommo_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subdomain TEXT NOT NULL,
  api_token TEXT NOT NULL,
  account_id INTEGER,
  account_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dashboard events / activity log
CREATE TABLE IF NOT EXISTS dashboard_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'lead_new', 'lead_updated', 'connection_test', 'error', 'sync'
  lead_id TEXT,
  lead_name TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cached lead snapshots (optional - for historical tracking)
CREATE TABLE IF NOT EXISTS lead_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  lead_name TEXT,
  pipeline_id INTEGER,
  status_id INTEGER,
  cadencia TEXT,
  recuperacao TEXT,
  situacao_reuniao TEXT,
  custom_fields JSONB DEFAULT '{}',
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, snapshot_date)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_events_type ON dashboard_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON dashboard_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON lead_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_lead ON lead_snapshots(lead_id);

-- RLS policies (enable if needed)
ALTER TABLE kommo_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow anon access (adjust based on your security requirements)
CREATE POLICY "Allow all for kommo_connections" ON kommo_connections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for dashboard_events" ON dashboard_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for lead_snapshots" ON lead_snapshots FOR ALL USING (true) WITH CHECK (true);
