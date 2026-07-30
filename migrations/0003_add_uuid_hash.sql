ALTER TABLE users ADD COLUMN uuid_hash TEXT;

CREATE INDEX users_uuid_hash_index ON users (uuid_hash);
