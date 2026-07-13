// Auth context: login/register/logout + guarded-action queue.
// Guest users may run the full workflow; downloads/exports/save actions call
// `guard(fn)` which either runs fn immediately (when logged in) or opens the
// auth modal + queues fn to fire after successful login.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const authApi = axios.create({ baseURL: API, withCredentials: true });

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // null = anonymous, {id,email,...} = authed
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("signin");
  const pendingAction = useRef(null);

  // Attempt to restore session
  useEffect(() => {
    (async () => {
      try {
        const { data } = await authApi.get("/auth/me");
        setUser(data.user);
      } catch (e) {}
      finally { setLoading(false); }
    })();
  }, []);

  const runPending = useCallback(() => {
    const fn = pendingAction.current;
    pendingAction.current = null;
    if (typeof fn === "function") { try { fn(); } catch (e) {} }
  }, []);

  const login = async ({ email, password, remember_me }) => {
    const { data } = await authApi.post("/auth/login", { email, password, remember_me });
    setUser(data.user);
    setModalOpen(false);
    setTimeout(runPending, 100);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await authApi.post("/auth/register", payload);
    setUser(data.user);
    setModalOpen(false);
    setTimeout(runPending, 100);
    return data;
  };

  const logout = async () => {
    try { await authApi.post("/auth/logout"); } catch (e) {}
    setUser(null);
  };

  const verifyEmail = async (token) => {
    await authApi.post("/auth/verify-email", { token });
    // Refresh user
    try { const { data } = await authApi.get("/auth/me"); setUser(data.user); } catch (e) {}
  };

  const resendVerification = async () => {
    const { data } = await authApi.post("/auth/resend-verification");
    return data;
  };

  const guard = useCallback((fn, opts = {}) => {
    if (user) { fn(); return; }
    pendingAction.current = fn;
    setModalTab(opts.tab === "signup" ? "signup" : "signin");
    setModalOpen(true);
  }, [user]);

  const openModal = useCallback((tab = "signin") => {
    setModalTab(tab); setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    pendingAction.current = null;
    setModalOpen(false);
  }, []);

  // Install global guard so lib-level exporters can call it without React context.
  useEffect(() => {
    window.__phytonet_auth = { user, guard, openModal };
    return () => { window.__phytonet_auth = null; };
  }, [user, guard, openModal]);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout, verifyEmail, resendVerification,
      guard, openModal, closeModal, modalOpen, modalTab, setModalTab,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Utility for lib-level exporters (no React context available). */
export function requireAuth(fn) {
  const g = window.__phytonet_auth;
  if (!g) { fn(); return; }         // pre-mount fallback: allow
  g.guard(fn);
}
