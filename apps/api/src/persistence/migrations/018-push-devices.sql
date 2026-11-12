-- Mobile devices that receive push notifications. A device token belongs to
-- the account signed in on that device; signing in with another account moves
-- it. Tokens rejected by FCM/APNs are deleted by the sender.
CREATE TABLE warehouse.push_devices (
  token text PRIMARY KEY CHECK (length(token) BETWEEN 16 AND 4096),
  user_id text NOT NULL REFERENCES warehouse."users" (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_id ON warehouse.push_devices (user_id);
