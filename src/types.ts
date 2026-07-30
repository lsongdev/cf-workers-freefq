export interface User {
  id: number;
  name: string;
  uuid: string;
  uuid_hash?: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSession {
  token_hash: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
}
