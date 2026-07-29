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
        <title>{props.title} · Rocket</title>
        <link rel="stylesheet" href="/rocket.css" />
      </head>
      <body>
        <header>
          <a class="brand" href={props.admin ? "/admin" : "/"}>🚀 Rocket</a>
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
