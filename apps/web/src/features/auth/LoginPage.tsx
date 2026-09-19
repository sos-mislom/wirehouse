import { MessengerButtons } from "../../MessengerButtons";
import { useWorkspaceContext } from "../../app/WorkspaceContext";
import { Button, Input } from "../../ui";
export function LoginPage() {
  const {
    session,
    overview,
    productBrand,
    tenantConnectionOpen,
    authMode,
    t,
    setAuthMode,
    error,
    notice,
    staffAuthStep,
    handleStaffLogin,
    handleFieldChange,
    setStaffForm,
    staffForm,
    busyAction,
    setResetForm,
    setStaffAuthStep,
    handleStaffMfaVerify,
    setStaffMfaForm,
    staffMfaForm,
    handlePasswordResetRequest,
    resetForm,
    handlePasswordResetConfirm,
    tenantOnboarding,
    setTenantConnectionOpen,
    setError,
    tenantOtpRequested,
    handleTenantVerify,
    handleTenantOtpRequest,
    setTenantForm,
    tenantForm,
    setNotice,
  } = useWorkspaceContext();

  return (
    <main className="auth-shell auth-shell--mvp">
      <section className="login-card">
        <div className="login-head">
          <div className="login-brand">
            <div>
              <strong>{productBrand.name}</strong>
              <span>{productBrand.subtitle}</span>
            </div>
          </div>
        </div>

        <div className="login-title">
          <p>
            {tenantConnectionOpen
              ? "Подключить мессенджер"
              : authMode === "staff"
                ? t.auth.staffTitle
                : "Вход по телефону"}
          </p>
        </div>

        {!tenantConnectionOpen && (
          <div className="auth-tabs auth-tabs--mvp">
            <Button
              variant="plain"
              className={
                authMode === "staff" ? "auth-tab auth-tab--active" : "auth-tab"
              }
              onClick={() => setAuthMode("staff")}
              type="button"
            >
              {t.auth.staffTab}
            </Button>
            <Button
              variant="plain"
              className={
                authMode === "tenant" ? "auth-tab auth-tab--active" : "auth-tab"
              }
              onClick={() => setAuthMode("tenant")}
              type="button"
            >
              {t.auth.tenantTab}
            </Button>
          </div>
        )}

        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="banner banner--notice" role="status">
            {notice}
          </div>
        ) : null}

        {authMode === "staff" ? (
          <>
            {staffAuthStep === "password" ? (
              <form className="auth-form" onSubmit={handleStaffLogin}>
                <label>
                  <span>{t.auth.email}</span>
                  <Input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    onChange={handleFieldChange(setStaffForm)}
                    placeholder="name@company.ru"
                    value={staffForm.email}
                  />
                </label>
                <label>
                  <span>{t.auth.password}</span>
                  <Input
                    name="password"
                    autoComplete="current-password"
                    required
                    onChange={handleFieldChange(setStaffForm)}
                    type="password"
                    value={staffForm.password}
                  />
                </label>
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "staff-login"}
                  type="submit"
                >
                  {t.auth.signIn}
                </Button>
                <Button
                  variant="text"
                  className="text-button text-button--neutral"
                  onClick={() => {
                    setResetForm((current) => ({
                      ...current,
                      email: staffForm.email,
                    }));
                    setStaffAuthStep("reset-request");
                  }}
                  type="button"
                >
                  {t.auth.forgotPassword}
                </Button>
              </form>
            ) : null}

            {staffAuthStep === "mfa" ? (
              <form className="auth-form" onSubmit={handleStaffMfaVerify}>
                <label>
                  <span>{t.auth.mfaCode}</span>
                  <Input
                    inputMode="numeric"
                    name="code"
                    onChange={handleFieldChange(setStaffMfaForm)}
                    value={staffMfaForm.code}
                  />
                </label>
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "staff-mfa"}
                  type="submit"
                >
                  {t.auth.verifyMfa}
                </Button>
              </form>
            ) : null}

            {staffAuthStep === "reset-request" ? (
              <form className="auth-form" onSubmit={handlePasswordResetRequest}>
                <h2>{t.auth.resetTitle}</h2>
                <p className="auth-inline-copy">{t.auth.resetHint}</p>
                <label>
                  <span>{t.auth.email}</span>
                  <Input
                    name="email"
                    onChange={handleFieldChange(setResetForm)}
                    value={resetForm.email}
                  />
                </label>
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "reset-request"}
                  type="submit"
                >
                  {t.auth.requestReset}
                </Button>
                <Button
                  variant="text"
                  className="text-button text-button--neutral"
                  onClick={() => setStaffAuthStep("password")}
                  type="button"
                >
                  {t.auth.backToLogin}
                </Button>
              </form>
            ) : null}

            {staffAuthStep === "reset-confirm" ? (
              <form className="auth-form" onSubmit={handlePasswordResetConfirm}>
                <h2>{t.auth.resetTitle}</h2>
                <label>
                  <span>{t.auth.resetCode}</span>
                  <Input
                    inputMode="numeric"
                    name="code"
                    onChange={handleFieldChange(setResetForm)}
                    value={resetForm.code}
                  />
                </label>
                <label>
                  <span>{t.auth.newPassword}</span>
                  <Input
                    name="password"
                    onChange={handleFieldChange(setResetForm)}
                    type="password"
                    value={resetForm.password}
                  />
                </label>
                <Button
                  variant="primary"
                  className="primary-button"
                  disabled={busyAction === "reset-confirm"}
                  type="submit"
                >
                  {t.auth.confirmReset}
                </Button>
                <Button
                  variant="text"
                  className="text-button text-button--neutral"
                  onClick={() => setStaffAuthStep("password")}
                  type="button"
                >
                  {t.auth.backToLogin}
                </Button>
              </form>
            ) : null}
          </>
        ) : tenantConnectionOpen ? (
          <section className="messenger-setup">
            {tenantOnboarding ? (
              <MessengerButtons
                channels={tenantOnboarding.channels}
                showInstructions
              />
            ) : (
              <p className="auth-delivery-hint" role="status">
                Загружаем доступные способы подключения…
              </p>
            )}
            <Button
              variant="text"
              className="text-button messenger-back"
              type="button"
              onClick={() => {
                setTenantConnectionOpen(false);
                setError("");
              }}
            >
              ← Ко входу
            </Button>
          </section>
        ) : (
          <>
            <form
              className="auth-form"
              onSubmit={
                tenantOtpRequested ? handleTenantVerify : handleTenantOtpRequest
              }
            >
              <label>
                <span>{t.auth.phone}</span>
                <Input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  placeholder="+7 999 123-45-67"
                  onChange={handleFieldChange(setTenantForm)}
                  value={tenantForm.phone}
                />
              </label>
              {tenantOtpRequested ? (
                <label>
                  <span>{t.auth.otp}</span>
                  <Input
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    onChange={handleFieldChange(setTenantForm)}
                    value={tenantForm.otp}
                  />
                </label>
              ) : null}
              <Button
                variant="primary"
                className="primary-button"
                disabled={
                  busyAction === "tenant-request" ||
                  busyAction === "tenant-verify" ||
                  !tenantOnboarding?.channels.some((channel) => channel.enabled)
                }
                type="submit"
              >
                {tenantOtpRequested ? t.auth.verifyOtp : t.auth.requestOtp}
              </Button>
              {!tenantOtpRequested && (
                <p className="auth-delivery-hint">
                  Код придёт в подключённый Telegram или VK.
                </p>
              )}
            </form>
            <div className="auth-connect-link">
              <span>Впервые здесь?</span>
              <Button
                variant="text"
                type="button"
                className="text-button"
                disabled={!tenantOnboarding}
                onClick={() => {
                  setTenantConnectionOpen(true);
                  setError("");
                  setNotice("");
                }}
              >
                Подключить мессенджер
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
