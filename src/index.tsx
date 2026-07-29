import { Hono } from "hono";
import { createAdminSession, currentAdmin, requireAdmin, revokeAdminSession } from "./auth";
import { randomHex, sha224 } from "./crypto";
import { trojanOverWSHandler } from "./proxy/trojan";
import { vlessOverWSHandler } from "./proxy/vless";
import type { User } from "./types";
import { AdminPage } from "./views/admin";
import { LoginPage } from "./views/login";

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

app.get("/", async (context) => {
  const authed = await currentAdmin(context);
  if (authed) return context.redirect("/admin");
  return context.redirect("/admin/login");
});

app.get("/admin/login", async (context) => {
  if (await currentAdmin(context)) return context.redirect("/admin");
  return context.html(<LoginPage />);
});

app.post("/admin/login", async (context) => {
  if (await currentAdmin(context)) return context.redirect("/admin");
  const body = await formBody(context.req.raw);
  const submitted = body.token;
  if (!submitted || submitted !== context.env.ACCESS_TOKEN) {
    return context.html(<LoginPage error="Invalid access token." />, 401);
  }
  await createAdminSession(context);
  return context.redirect("/admin");
});

app.get("/admin/logout", async (context) => {
  await revokeAdminSession(context);
  return context.redirect("/admin/login");
});

app.get("/admin", async (context) => {
  if (!(await requireAdmin(context))) return context.redirect("/admin/login");
  const users = await context.env.DB.prepare(
    "SELECT * FROM users ORDER BY created_at DESC",
  ).all<User>();
  const host = context.req.header("Host") || "localhost:8787";
  return context.html(<AdminPage users={users.results} host={host} />);
});

app.post("/admin/users", async (context) => {
  if (!(await requireAdmin(context))) return context.redirect("/admin/login");
  const body = await formBody(context.req.raw);
  const name = body.name?.trim();
  if (!name) {
    const users = await context.env.DB.prepare("SELECT * FROM users ORDER BY created_at DESC").all<User>();
    const host = context.req.header("Host") || "localhost:8787";
    return context.html(<AdminPage users={users.results} host={host} error="Name is required." />, 400);
  }
  const uuid = crypto.randomUUID();
  const rawPassword = randomHex(16);
  const sha224Password = await sha224(rawPassword);
  try {
    await context.env.DB.prepare(
      "INSERT INTO users (name, uuid, sha224_password) VALUES (?, ?, ?)",
    ).bind(name, uuid, sha224Password).run();
  } catch {
    const users = await context.env.DB.prepare("SELECT * FROM users ORDER BY created_at DESC").all<User>();
    const host = context.req.header("Host") || "localhost:8787";
    return context.html(<AdminPage users={users.results} host={host} error="Failed to create user." />, 400);
  }
  return context.redirect("/admin");
});

app.post("/admin/users/:id/toggle", async (context) => {
  if (!(await requireAdmin(context))) return context.redirect("/admin/login");
  const id = context.req.param("id");
  const user = await context.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
  if (user) {
    await context.env.DB.prepare("UPDATE users SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(user.enabled ? 0 : 1, id)
      .run();
  }
  return context.redirect("/admin");
});

app.post("/admin/users/:id/delete", async (context) => {
  if (!(await requireAdmin(context))) return context.redirect("/admin/login");
  const id = context.req.param("id");
  await context.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return context.redirect("/admin");
});

app.get("/trojan", async (context) => {
  const upgradeHeader = context.req.header("Upgrade");
  if (upgradeHeader?.toLowerCase() === "websocket") {
    return trojanOverWSHandler(context.req.raw, context.env);
  }
  return context.text("Trojan proxy endpoint. Use WebSocket connection.", 400);
});

app.get("/vless", async (context) => {
  const upgradeHeader = context.req.header("Upgrade");
  if (upgradeHeader?.toLowerCase() === "websocket") {
    return vlessOverWSHandler(context.req.raw, context.env);
  }
  return context.text("VLESS proxy endpoint. Use WebSocket connection.", 400);
});

app.get("/link/vless/:uuid", async (context) => {
  const uuid = context.req.param("uuid");
  const user = await context.env.DB.prepare(
    "SELECT * FROM users WHERE uuid = ? AND enabled = 1",
  ).bind(uuid).first<User>();
  if (!user) return context.text("User not found", 404);
  const host = context.req.header("Host") || "localhost:8787";
  const link = `vless://${user.uuid}@${host}:443?encryption=none&security=tls&sni=${host}&fp=randomized&type=ws&host=${host}&path=%2Fvless#${user.name}`;
  return context.text(link);
});

app.get("/link/trojan/:password", async (context) => {
  const password = context.req.param("password");
  const user = await context.env.DB.prepare(
    "SELECT * FROM users WHERE sha224_password = ? AND enabled = 1",
  ).bind(password).first<User>();
  if (!user) return context.text("User not found", 404);
  const host = context.req.header("Host") || "localhost:8787";
  const link = `trojan://${user.sha224_password}@${host}:443?type=ws&host=${host}&path=%2Ftrojan&security=tls#${user.name}`;
  return context.text(link);
});

app.notFound((context) => context.text("Not found", 404));
app.onError((error, context) => {
  console.error(error.message);
  return context.text("Internal error", 500);
});

async function formBody(request: Request): Promise<Record<string, string>> {
  const data = await request.formData();
  const values: Record<string, string> = {};
  data.forEach((value, key) => {
    if (typeof value === "string") values[key] = value;
  });
  return values;
}

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
