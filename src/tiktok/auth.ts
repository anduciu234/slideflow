/**
 * TikTok Login Kit (OAuth v2). Tokens per account are stored in library/accounts.json.
 * Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management
 */
import crypto from "node:crypto";
import http from "node:http";
import { execFile } from "node:child_process";
import { PATHS, readJson, requireEnv, writeJson } from "../config.js";
import type { TikTokAccount } from "../types.js";

// Add user.info.profile,user.info.stats,video.list (after enabling them on the app) for the stats dashboard.
const SCOPES = process.env.TIKTOK_SCOPES?.trim() || "user.info.basic,video.upload,video.publish";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export const loadAccounts = () => readJson<Record<string, TikTokAccount>>(PATHS.accounts, {});
const saveAccounts = (a: Record<string, TikTokAccount>) => writeJson(PATHS.accounts, a);

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
      ...params,
    }),
  });
  const j: any = await res.json();
  if (!res.ok || j.error) throw new Error(`TikTok token error: ${j.error ?? res.status} ${j.error_description ?? ""}`);
  return j as {
    open_id: string;
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    scope: string;
  };
}

/**
 * Runs the full login: local callback server → browser consent → token exchange.
 * Register TIKTOK_REDIRECT_URI on your app. For the Desktop platform TikTok uses PKCE
 * with a *hex-encoded* SHA256 challenge (unlike the RFC's base64url).
 */
export async function loginAccount(name?: string): Promise<TikTokAccount> {
  const redirectUri = requireEnv("TIKTOK_REDIRECT_URI");
  const redirect = new URL(redirectUri);
  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("hex");

  const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
  auth.search = new URLSearchParams({
    client_key: requireEnv("TIKTOK_CLIENT_KEY"),
    scope: SCOPES,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", redirect.origin);
      if (u.pathname !== redirect.pathname) return void res.writeHead(404).end();
      const err = u.searchParams.get("error");
      if (err || u.searchParams.get("state") !== state) {
        res.end("Login failed — you can close this tab.");
        server.close();
        return reject(new Error(err ?? "state mismatch"));
      }
      res.end("Connected to TikTok. You can close this tab.");
      server.close();
      resolve(u.searchParams.get("code")!);
    });
    server.listen(Number(redirect.port || 80), () => {
      console.error(`Opening TikTok consent page…\nIf it doesn't open, visit:\n${auth}`);
      // open the consent page in the default browser (macOS / Windows / Linux)
      const [cmd, args] =
        process.platform === "darwin" ? ["open", [auth.toString()]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", auth.toString()]] : ["xdg-open", [auth.toString()]];
      execFile(cmd as string, args as string[], () => {});
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for TikTok login"));
    }, 5 * 60_000).unref();
  });

  const t = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const info: any = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json());
  const displayName: string = info?.data?.user?.display_name ?? t.open_id;

  const account: TikTokAccount = {
    name: name ?? displayName,
    openId: t.open_id,
    displayName,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    accessExpiresAt: Date.now() + t.expires_in * 1000,
    refreshExpiresAt: Date.now() + t.refresh_expires_in * 1000,
    scope: t.scope,
  };
  const all = loadAccounts();
  all[account.name] = account;
  saveAccounts(all);
  return account;
}

/** Returns a valid access token for the named account, refreshing if needed. */
export async function accessToken(name: string): Promise<string> {
  const all = loadAccounts();
  const a = all[name];
  if (!a) throw new Error(`No TikTok account "${name}". Run: npm run tiktok:login -- <name>`);
  if (a.accessExpiresAt - Date.now() > 5 * 60_000) return a.accessToken;
  if (a.refreshExpiresAt < Date.now()) throw new Error(`Refresh token for "${name}" expired — log in again.`);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: a.refreshToken });
  all[name] = {
    ...a,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    accessExpiresAt: Date.now() + t.expires_in * 1000,
    refreshExpiresAt: Date.now() + t.refresh_expires_in * 1000,
  };
  saveAccounts(all);
  return t.access_token;
}
