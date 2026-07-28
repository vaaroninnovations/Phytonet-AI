// Admin auth context — completely separate from the user AuthContext.
// Cookies used: admin_access_token / admin_refresh_token (server-set httpOnly).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/admin`;
export const adminApi = axios.create({ baseURL: API, withCredentials: true });

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);       // null | admin object | false
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get("/auth/me");
        setAdmin(data.admin);
      } catch { setAdmin(false); }
      finally { setLoading(false); }
    })();
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const { data } = await adminApi.post("/auth/login", { email, password });
    if (data.two_factor_required) {
      return { twoFactorRequired: true, method: data.method,
               challengeToken: data.challenge_token };
    }
    setAdmin(data.admin);
    return { twoFactorRequired: false, admin: data.admin };
  }, []);

  const verify2FA = useCallback(async ({ challengeToken, code }) => {
    const { data } = await adminApi.post("/auth/2fa/verify", {
      challenge_token: challengeToken, code,
    });
    setAdmin(data.admin);
    return data.admin;
  }, []);

  const sendEmailOtp = useCallback(async (challengeToken) => {
    await adminApi.post("/auth/2fa/send-email", {
      challenge_token: challengeToken,
    });
  }, []);

  const logout = useCallback(async () => {
    try { await adminApi.post("/auth/logout"); } catch {}
    setAdmin(false);
    window.location.href = "/admin/login";
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await adminApi.get("/auth/me");
      setAdmin(data.admin);
      return data.admin;
    } catch {
      setAdmin(false);
      return null;
    }
  }, []);

  return (
    <AdminAuthContext.Provider value={{
      admin, loading, login, verify2FA, sendEmailOtp, logout, refresh,
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
