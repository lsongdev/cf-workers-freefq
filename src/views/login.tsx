import { Layout } from "./layout";

export function LoginPage({ error }: { error?: string }) {
  return (
    <Layout title="Admin Login" error={error}>
      <div class="login-box">
        <h1>Admin Login</h1>
        <form method="post" action="/admin/login">
          <div class="form-group">
            <label for="token">Access Token</label>
            <input type="password" id="token" name="token" required autocomplete="current-password" />
          </div>
          <button type="submit">Sign in</button>
        </form>
      </div>
    </Layout>
  );
}
