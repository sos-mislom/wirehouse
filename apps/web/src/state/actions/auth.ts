import { type FormEvent } from "react";
import { apiRequest } from "../../api/client";
import { TOKEN_KEY } from "../../shared/navigation";
import { type SessionUser } from "../../shared/types";
import type { WorkspaceBase } from "../types";
import type { useDataActions } from "./data";
export function useAuthActions(
  deps: Pick<
    WorkspaceBase,
    | "mfaToken"
    | "setBusyAction"
    | "setError"
    | "staffForm"
    | "setMfaToken"
    | "setStaffAuthStep"
    | "setNotice"
    | "staffMfaForm"
    | "setStaffMfaForm"
    | "resetForm"
    | "t"
    | "setStaffForm"
    | "setResetForm"
    | "tenantForm"
    | "setTenantOtpRequested"
    | "session"
    | "setTotpSetup"
    | "totpSetup"
    | "setSession"
    | "setOverview"
    | "setTickets"
    | "setTicketComments"
    | "setTenantDetail"
    | "setManagerScreen"
    | "setSelectedUnitId"
    | "setTenantDetailTab"
    | "setSelectedChatTenantId"
    | "setChatMessages"
    | "setChatDraft"
    | "setStaffCreateForm"
  > &
    Pick<ReturnType<typeof useDataActions>, "hydrateSession">,
) {
  const {
    mfaToken,
    setBusyAction,
    setError,
    staffForm,
    setMfaToken,
    setStaffAuthStep,
    setNotice,
    hydrateSession,
    staffMfaForm,
    setStaffMfaForm,
    resetForm,
    t,
    setStaffForm,
    setResetForm,
    tenantForm,
    setTenantOtpRequested,
    session,
    setTotpSetup,
    totpSetup,
    setSession,
    setOverview,
    setTickets,
    setTicketComments,
    setTenantDetail,
    setManagerScreen,
    setSelectedUnitId,
    setTenantDetailTab,
    setSelectedChatTenantId,
    setChatMessages,
    setChatDraft,
    setStaffCreateForm,
  } = deps;
  const handleStaffLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("staff-login");
    setError("");

    try {
      const result = await apiRequest<
        | { token: string; user: SessionUser }
        | {
            mfaRequired: true;
            mfaToken: string;
            user: { email: string; fullName: string };
          }
      >("/api/auth/staff/login", {
        method: "POST",
        body: staffForm,
      });
      if ("mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        setStaffAuthStep("mfa");
        setNotice("");
        return;
      }
      await hydrateSession(result.token);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Login failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleStaffMfaVerify = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("staff-mfa");
    setError("");

    try {
      const result = await apiRequest<{ token: string; user: SessionUser }>(
        "/api/auth/staff/verify-2fa",
        {
          method: "POST",
          body: {
            mfaToken,
            code: staffMfaForm.code,
          },
        },
      );
      setMfaToken("");
      setStaffMfaForm({ code: "" });
      setStaffAuthStep("password");
      await hydrateSession(result.token);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "2FA failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handlePasswordResetRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("reset-request");
    setError("");

    try {
      await apiRequest("/api/auth/password-reset/request", {
        method: "POST",
        body: {
          email: resetForm.email,
        },
      });
      setStaffAuthStep("reset-confirm");
      setNotice(t.auth.resetHint);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Password reset failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handlePasswordResetConfirm = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("reset-confirm");
    setError("");

    try {
      await apiRequest("/api/auth/password-reset/confirm", {
        method: "POST",
        body: resetForm,
      });
      setStaffForm((current) => ({
        ...current,
        email: resetForm.email,
        password: "",
      }));
      setResetForm({ email: "", code: "", password: "" });
      setStaffAuthStep("password");
      setNotice(t.messages.saved);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Password reset failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleTenantOtpRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("tenant-request");
    setError("");

    try {
      await apiRequest("/api/auth/tenant/request-otp", {
        method: "POST",
        body: {
          phone: tenantForm.phone,
        },
      });
      setTenantOtpRequested(true);
      setNotice(t.messages.otpSent);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "OTP request failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleTenantVerify = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("tenant-verify");
    setError("");

    try {
      const result = await apiRequest<{ token: string; user: SessionUser }>(
        "/api/auth/tenant/verify-otp",
        {
          method: "POST",
          body: tenantForm,
        },
      );
      await hydrateSession(result.token);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "OTP verification failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleTotpSetup = async () => {
    if (!session) {
      return;
    }

    setBusyAction("totp-setup");
    setError("");

    try {
      const result = await apiRequest<{ secret: string; otpauthUrl: string }>(
        "/api/auth/2fa/setup",
        {
          method: "POST",
          token: session.token,
        },
      );
      setTotpSetup({
        ...result,
        code: "",
        password: "",
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "2FA setup failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleTotpConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !totpSetup) {
      return;
    }

    setBusyAction("totp-confirm");
    setError("");

    try {
      const result = await apiRequest<{ user: SessionUser }>(
        "/api/auth/2fa/confirm",
        {
          method: "POST",
          token: session.token,
          body: {
            code: totpSetup.code,
          },
        },
      );
      setSession({
        ...session,
        user: result.user,
      });
      setTotpSetup(null);
      setNotice(t.messages.saved);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "2FA confirm failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleTotpDisable = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !totpSetup) {
      return;
    }

    setBusyAction("totp-disable");
    setError("");

    try {
      const result = await apiRequest<{ user: SessionUser }>(
        "/api/auth/2fa/disable",
        {
          method: "POST",
          token: session.token,
          body: {
            password: totpSetup.password,
            code: totpSetup.code,
          },
        },
      );
      setSession({
        ...session,
        user: result.user,
      });
      setTotpSetup(null);
      setNotice(t.messages.saved);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "2FA disable failed",
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setOverview(null);
    setTickets([]);
    setTicketComments([]);
    setTenantDetail(null);
    setTenantOtpRequested(false);
    setManagerScreen("dashboard");
    setSelectedUnitId("");
    setTenantDetailTab("info");
    setSelectedChatTenantId("");
    setChatMessages([]);
    setChatDraft({
      content: "",
    });
    setStaffCreateForm({
      fullName: "",
      email: "",
      phone: "",
      password: "",
      role: "worker",
      propertyId: "",
    });
    setNotice("");
    setError("");
  };
  return {
    handleStaffLogin,
    handleStaffMfaVerify,
    handlePasswordResetRequest,
    handlePasswordResetConfirm,
    handleTenantOtpRequest,
    handleTenantVerify,
    handleTotpSetup,
    handleTotpConfirm,
    handleTotpDisable,
    handleLogout,
  };
}
