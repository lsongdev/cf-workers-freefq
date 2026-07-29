import type { Child } from "hono/jsx";

export function Layout(props: {
  title: string;
  admin?: boolean;
  error?: string;
  children: Child;
}) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{props.title} · Proxy</title>
        <style>{css}</style>
      </head>
      <body>
        <header>
          <a class="brand" href={props.admin ? "/admin" : "/"}>Proxy</a>
          {props.admin && (
            <nav>
              <a class="button outline" href="/admin/logout">Sign out</a>
            </nav>
          )}
        </header>
        <main>
          {props.error && <div class="alert error">{props.error}</div>}
          {props.children}
        </main>
      </body>
    </html>
  );
}

const css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:light dark;--bg:#fff;--text:#1a1a2e;--muted:#6b7280;--border:#e5e7eb;--accent:#3b82f6;--accent-hover:#2563eb;--danger:#ef4444;--danger-hover:#dc2626;--success:#22c55e;--alert-bg:#fef2f2;--alert-border:#fecaca;--card-bg:#f9fafb}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--text:#e2e8f0;--muted:#94a3b8;--border:#334155;--accent:#60a5fa;--accent-hover:#93bbfd;--danger:#f87171;--danger-hover:#fca5a5;--success:#4ade80;--alert-bg:#451a1a;--alert-border:#991b1b;--card-bg:#1e293b}}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
header{display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;border-bottom:1px solid var(--border);max-width:1200px;margin:0 auto;width:100%}
.brand{font-size:1.25rem;font-weight:700;color:var(--accent);text-decoration:none}
nav{display:flex;align-items:center;gap:1rem}
main{max-width:1200px;margin:0 auto;padding:2rem;width:100%}
.alert{padding:.75rem 1rem;border-radius:6px;margin-bottom:1.5rem;font-size:.9rem}
.alert.error{background:var(--alert-bg);border:1px solid var(--alert-border);color:var(--danger)}
h1{font-size:1.5rem;margin-bottom:1.5rem}
h2{font-size:1.15rem;margin-bottom:1rem;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin-bottom:2rem}
th,td{text-align:left;padding:.75rem;border-bottom:1px solid var(--border);font-size:.9rem}
th{color:var(--muted);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
.form-group{margin-bottom:1rem}
label{display:block;font-size:.85rem;font-weight:600;color:var(--muted);margin-bottom:.35rem}
input[type=text],input[type=password]{width:100%;padding:.6rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.9rem;background:var(--bg);color:var(--text);font-family:var(--font-mono,monospace)}
input:focus{outline:2px solid var(--accent);outline-offset:-1px}
.button-group{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
a.button,button{display:inline-flex;align-items:center;padding:.5rem 1rem;border-radius:6px;font-size:.85rem;font-weight:500;border:none;cursor:pointer;text-decoration:none;background:var(--accent);color:#fff;transition:background .15s}
a.button:hover,button:hover{background:var(--accent-hover)}
button.danger{background:var(--danger)}
button.danger:hover{background:var(--danger-hover)}
button.outline,a.button.outline{background:transparent;color:var(--text);border:1px solid var(--border)}
button.outline:hover,a.button.outline:hover{background:var(--card-bg)}
button.plain{background:none;border:none;color:var(--accent);cursor:pointer;font-size:.85rem;padding:0}
button.plain:hover{text-decoration:underline}
.tag{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600}
.tag.active{background:#dcfce7;color:#166534}
.tag.inactive{background:#fef2f2;color:#991b1b}
@media(prefers-color-scheme:dark){.tag.active{background:#064e3b;color:#6ee7b7}.tag.inactive{background:#7f1d1d;color:#fca5a5}}
.mono{font-family:var(--font-mono,ui-monospace,monospace);font-size:.8rem;word-break:break-all}
.empty{text-align:center;padding:3rem;color:var(--muted)}
.copy-btn{font-size:.75rem;padding:.2rem .5rem;margin-left:.5rem;background:var(--card-bg);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--muted)}
.copy-btn:hover{color:var(--text)}
.login-box{max-width:400px;margin:4rem auto;padding:2rem;border:1px solid var(--border);border-radius:8px;background:var(--card-bg)}
.login-box h1{text-align:center;margin-bottom:1.5rem;font-size:1.25rem}
.login-box button{width:100%;justify-content:center;margin-top:.5rem}
small{font-size:.8rem;color:var(--muted)}
.config-link{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:.75rem;margin-top:.25rem;font-size:.8rem;word-break:break-all;font-family:var(--font-mono,monospace)}
`;
