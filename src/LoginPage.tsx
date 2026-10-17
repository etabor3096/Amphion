import { useState } from "react";
import AmphionLogo from "./AmphionLogo";

export type Theme = "light" | "dark";

interface LoginPageProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignIn: () => void;
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" stroke="none" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z" />
      <path fill="#34A853" stroke="none" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.25-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" stroke="none" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.62.39 3.15 1.04 4.54l3.35-2.62Z" />
      <path fill="#EA4335" stroke="none" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.94 12 5.94Z" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {hidden && <path d="m4 4 16 16" />}
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "light" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3V1.5M12 22.5V21M3 12H1.5M22.5 12H21M5.64 5.64 4.58 4.58M19.42 19.42l-1.06-1.06M18.36 5.64l1.06-1.06M4.58 19.42l1.06-1.06" />
      <circle cx="12" cy="12" r="4.25" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 15.4A8.5 8.5 0 0 1 8.6 3.5a8.5 8.5 0 1 0 11.9 11.9Z" />
    </svg>
  );
}

export default function LoginPage({ theme, onThemeChange, onSignIn }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [view, setView] = useState<"signin" | "forgot" | "reset-sent">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Demo: there is no backend, so every sign-in option is a fake "Continue" into the Library.
  const submitSignIn = () => onSignIn();

  return (
    <main className="login-page" data-theme={theme}>
      <header className="login-header">
        <div className="wordmark">
          <AmphionLogo />
          <span>Amphion</span>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
        >
          <ThemeIcon theme={theme} />
        </button>
      </header>

      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-intro">
          <span className="eyebrow">Your music, made playable</span>
          <h1 id="login-title">{view === "signin" ? "Welcome back" : view === "forgot" ? "Reset your password" : "Check your inbox"}</h1>
          <p>
            {view === "signin"
              ? "Sign in to keep learning songs by ear, one note at a time."
              : view === "forgot"
                ? "Enter the email you use for Amphion."
                : "Check your inbox for a reset link."}
          </p>
        </div>

        {view === "signin" ? (
          <form
            className="login-card"
            onSubmit={(event) => {
              event.preventDefault();
              submitSignIn();
            }}
          >
            <p className="demo-signin-note">Demo mode: no account needed. Any option below continues to your Library.</p>
            <div className="social-buttons social-buttons-first">
              <button className="button button-secondary" type="button" onClick={onSignIn}>
                <AppleIcon />
                Continue with Apple
              </button>
              <button className="button button-secondary" type="button" onClick={onSignIn}>
                <GoogleIcon />
                Continue with Google
              </button>
            </div>

            <div className="divider"><span>or use email</span></div>

            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>

            <label className="field">
              <span className="field-label-row">
                <span>Password</span>
                <button className="text-button" type="button" onClick={() => setView("forgot")}>Forgot password?</button>
              </span>
              <span className="password-field">
                <input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <EyeIcon hidden={showPassword} />
                </button>
              </span>
            </label>

            <button className="button button-primary" type="submit">Continue</button>

            <p className="signup-copy">
              New to Amphion? <button className="text-button" type="button" onClick={onSignIn}>Create an account</button>
            </p>
          </form>
        ) : view === "forgot" ? (
          <form
            className="login-card reset-card"
            onSubmit={(event) => {
              event.preventDefault();
              setView("reset-sent");
            }}
          >
            <label className="field">
              <span>Email</span>
              <input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button className="button button-primary" type="submit">Send reset link</button>
            <button className="login-back-button" type="button" onClick={() => setView("signin")}>Back to sign in</button>
          </form>
        ) : (
          <div className="login-card reset-card reset-confirmation">
            <span className="reset-mail-icon" aria-hidden="true">✓</span>
            <p>We sent a reset link to <strong>{email}</strong>.</p>
            <button className="button button-primary" type="button" onClick={() => setView("signin")}>Back to sign in</button>
          </div>
        )}
      </section>

      <footer className="login-footer">
        <span>Listen closely. Play confidently.</span>
      </footer>
    </main>
  );
}
