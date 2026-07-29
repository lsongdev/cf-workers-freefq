export {};

declare global {
  interface Env {
    APP_URL: string;
    ACCESS_TOKEN: string;
    SESSION_SECRET: string;
    PROXYIP?: string;
    DB: D1Database;
  }

  namespace Cloudflare {
    interface Env {
      ACCESS_TOKEN: string;
      SESSION_SECRET: string;
    }
  }
}
