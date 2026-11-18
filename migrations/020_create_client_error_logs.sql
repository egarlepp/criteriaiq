CREATE TABLE IF NOT EXISTS client_error_logs (
  id SERIAL PRIMARY KEY,
  error_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  context VARCHAR(500),
  user_id VARCHAR(255),
  message TEXT,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_timestamp ON client_error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_user_id ON client_error_logs(user_id);
