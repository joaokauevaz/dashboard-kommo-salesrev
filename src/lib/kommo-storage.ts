import type { KommoCredentials } from "@/types/kommo";

const STORAGE_KEY = "psi_kommo_credentials";
const ACCOUNT_KEY = "psi_kommo_account";

// ⚠️ CONFIGURE AQUI suas credenciais padrão da Kommo
// Isso permite que o dashboard abra já conectado automaticamente.
// Se preferir que o usuário digite manualmente, deixe os campos vazios.
const DEFAULT_CREDENTIALS: KommoCredentials = {
  subdomain: "contatosalesrevcombr",
  apiToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjMwN2Y2ODdlZTNlM2E0MmJhOTE4YWYxYWQ1YWM0ZTJmZTk5ZWViZDNjZGNmOWIyMjg3Nzk5NTg5Zjg4NjczN2I0N2EyZjVkOTI5MWRiODBkIn0.eyJhdWQiOiI4MzA1MGEwZi1lZDlkLTQ0M2EtYjc1YS0yN2JjYmQ0MWJhYmYiLCJqdGkiOiIzMDdmNjg3ZWUzZTNhNDJiYTkxOGFmMWFkNWFjNGUyZmU5OWVlYmQzY2RjZjliMjI4Nzc5OTU4OWY4ODY3MzdiNDdhMmY1ZDkyOTFkYjgwZCIsImlhdCI6MTc3OTAzNDM1NCwibmJmIjoxNzc5MDM0MzU0LCJleHAiOjE5MTI0NjQwMDAsInN1YiI6IjEzMTE5MzE5IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjM0NTI2NDgzLCJiYXNlX2RvbWFpbiI6ImtvbW1vLmNvbSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiMGQ5MmQyNzAtNTAzOS00ZDRhLTk4OWMtMjJkODRiNGQzYTgyIiwiYXBpX2RvbWFpbiI6ImFwaS1nLmtvbW1vLmNvbSJ9.mNO3HxTKeoMMjorzuWmh91flaRvaogb9iSum5BjgGav-X2GJRzbaZS8khTwTc-P_2DN3-D1NFGNH2_i6pPTWhJJ5awNBbGkk_JQGXSTSYYvskg_GcP4aPOJj6QBuEUBFXWArhybF4oGGbKY_8K0t42t1HP6-o5THGlRSHYLzhDCQ__URXkGZ3WV_ufWGTI7z8WtW_9lx_-R_rUa-qI5FUzx3N6k9b-2l_vMe8-J5qyh13qapRh1K1OXVjU29JWKh-Tuz6nxiiIpRkzqwEDNU5JD6WeamBzDg6m2Y02t-r-NK4PIQ0oRNQcf4ex36J2I9k-QcxAoIL-FihI-KdRrpig",
};

export function saveCredentials(creds: KommoCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function getCredentials(): KommoCredentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Se não tem credenciais salvas, usa as padrão (se configuradas)
    if (DEFAULT_CREDENTIALS.subdomain && DEFAULT_CREDENTIALS.apiToken) {
      return DEFAULT_CREDENTIALS;
    }
    return null;
  }
  try {
    return JSON.parse(raw) as KommoCredentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

export function saveAccountInfo(info: { id: number; name: string }): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(info));
}

export function getAccountInfo(): { id: number; name: string } | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isConnected(): boolean {
  return !!getCredentials();
}
