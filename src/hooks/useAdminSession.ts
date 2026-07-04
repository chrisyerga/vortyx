import { useMutation } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import {
  clearStoredAdminToken,
  getStoredAdminToken,
  setStoredAdminToken,
} from "../lib/adminSession";

export function useAdminSession() {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [booting, setBooting] = useState(() => getStoredAdminToken() !== null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = useMutation(api.admin.login);
  const logout = useMutation(api.admin.logout);
  const validateSession = useMutation(api.admin.validateSession);

  useEffect(() => {
    const stored = getStoredAdminToken();
    if (!stored) {
      setBooting(false);
      return;
    }

    void validateSession({ token: stored })
      .then((valid) => {
        if (valid) {
          setToken(stored);
        } else {
          clearStoredAdminToken();
          setToken(null);
        }
      })
      .finally(() => {
        setBooting(false);
      });
  }, [validateSession]);

  const handleLogin = async (event: FormEvent, password: string) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await login({ password });
      setStoredAdminToken(session.token);
      setToken(session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      await logout({ token });
    }
    clearStoredAdminToken();
    setToken(null);
  };

  return {
    token,
    booting,
    error,
    setError,
    busy,
    setBusy,
    handleLogin,
    handleLogout,
  };
}
