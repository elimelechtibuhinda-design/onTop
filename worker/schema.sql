-- One row per sync group. `data` is encrypted on the student's device; the server can't read it.
CREATE TABLE IF NOT EXISTS blobs (
  id TEXT PRIMARY KEY,          -- derived from the sync code on the device (the code itself never leaves it)
  version INTEGER NOT NULL,     -- bumps on every write; used to detect two devices writing at once
  data TEXT NOT NULL,           -- base64(iv + AES-GCM ciphertext of gzip(JSON))
  updated_at INTEGER NOT NULL
);

-- Flashcard pictures, encrypted on the device like everything else. One row per picture.
CREATE TABLE IF NOT EXISTS images (
  group_id TEXT NOT NULL,       -- same id as blobs.id
  img_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, img_id)
);
