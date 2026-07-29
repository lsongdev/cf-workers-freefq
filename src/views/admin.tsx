import type { User } from "../types";
import { Layout } from "./layout";

export function AdminPage(props: {
  users: User[];
  host: string;
  error?: string;
}) {
  return (
    <Layout title="Dashboard" admin error={props.error}>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
        <h1 style="margin:0">Proxy Users</h1>
      </div>

      <section style="margin-bottom:2rem;padding:1.25rem;border:1px solid var(--border);border-radius:8px;background:var(--card-bg)">
        <h2 style="margin-bottom:1rem">Add User</h2>
        <form method="post" action="/admin/users">
          <div class="form-group">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" required placeholder="e.g. alice" />
          </div>
          <button type="submit">Generate & Add</button>
        </form>
      </section>

      {props.users.length === 0 ? (
        <div class="empty">No users yet. Add your first user above.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>UUID (Password)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong></td>
                <td class="mono">{user.uuid}</td>
                <td>
                  <span class={`tag ${user.enabled ? "active" : "inactive"}`}>
                    {user.enabled ? "active" : "disabled"}
                  </span>
                </td>
                <td>
                  <div class="button-group">
                    <form method="post" action={`/admin/users/${user.id}/toggle`} style="display:inline">
                      <button type="submit" class="outline" style="font-size:.8rem;padding:.3rem .6rem">
                        {user.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form method="post" action={`/admin/users/${user.id}/delete`} style="display:inline"
                      onsubmit="return confirm('Delete user &quot;{user.name}&quot;?')">
                      <button type="submit" class="danger" style="font-size:.8rem;padding:.3rem .6rem">Delete</button>
                    </form>
                    <a class="button outline" style="font-size:.8rem;padding:.3rem .6rem"
                       href={`/link/vless/${user.uuid}`} target="_blank">VLESS</a>
                    <a class="button outline" style="font-size:.8rem;padding:.3rem .6rem"
                       href={`/link/trojan/${user.uuid}`} target="_blank">Trojan</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details style="margin-top:2rem">
        <summary style="cursor:pointer;color:var(--muted);font-size:.9rem">Config Links</summary>
        {props.users.map((user) => (
          <div key={user.id} style="margin-top:.75rem;padding:1rem;border:1px solid var(--border);border-radius:6px">
            <strong>{user.name}</strong>
            <div style="margin-top:.5rem;font-size:.85rem">
              <div style="margin-bottom:.25rem;color:var(--muted)">VLESS</div>
              <div class="config-link">{`vless://${user.uuid}@${props.host}:443?encryption=none&security=tls&sni=${props.host}&fp=randomized&type=ws&host=${props.host}&path=%2Fvless#${user.name}`}</div>
            </div>
            <div style="margin-top:.5rem;font-size:.85rem">
              <div style="margin-bottom:.25rem;color:var(--muted)">Trojan</div>
              <div class="config-link">{`trojan://${user.uuid}@${props.host}:443?type=ws&host=${props.host}&path=%2Ftrojan&security=tls#${user.name}`}</div>
            </div>
          </div>
        ))}
      </details>
    </Layout>
  );
}
