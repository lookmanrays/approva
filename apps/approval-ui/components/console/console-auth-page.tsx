'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConsoleAuthBootstrapStatusResponse } from '@approva/shared';
import {
  bootstrapConsole,
  getConsoleBootstrapStatus,
  getConsoleSession,
  loginConsole,
} from '@/lib/console-auth-client';

function normalizeConsolePath(path: string) {
  return path.startsWith('/') ? path : '/console/settings';
}

export function ConsoleAuthPage({
  callbackUrl,
}: {
  callbackUrl: string;
}) {
  const router = useRouter();
  const [bootstrapStatus, setBootstrapStatus] =
    useState<ConsoleAuthBootstrapStatusResponse | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [session, nextBootstrapStatus] = await Promise.all([
          getConsoleSession(),
          getConsoleBootstrapStatus(),
        ]);

        if (cancelled) {
          return;
        }

        if (session.authenticated) {
          router.replace(normalizeConsolePath(callbackUrl));
          return;
        }

        setBootstrapStatus(nextBootstrapStatus);
        setEmail(nextBootstrapStatus.bootstrapRequired ? nextBootstrapStatus.bootstrapIdentity?.email ?? '' : '');
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Failed to load console auth status.',
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, router]);

  const submitBootstrap = () => {
    setError(null);

    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    startTransition(async () => {
      try {
        await bootstrapConsole({ password });
        router.replace('/console/settings?setup=1');
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : 'Failed to bootstrap console auth.',
        );
      }
    });
  };

  const submitLogin = () => {
    setError(null);

    startTransition(async () => {
      try {
        await loginConsole({
          email,
          password,
        });
        router.replace(normalizeConsolePath(callbackUrl));
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Failed to sign in.');
      }
    });
  };

  return (
    <section className="auth-grid">
      <article className="card stack">
        <div>
          <span className="eyebrow">Approva</span>
          <h1 className="auth-title">
            {bootstrapStatus?.bootstrapRequired ? 'Set up the first console owner' : 'Sign in to the console'}
          </h1>
        </div>

        <p>
          Console sign-in is separate from approval passkeys. Approval links still use the secure
          link plus passkey flow.
        </p>

        {bootstrapStatus?.bootstrapRequired ? (
          <>
            <div className="notice info">
              <strong>First owner setup</strong>
              <div>
                This creates the first local owner using the operator identity configured for this
                self-host deployment.
              </div>
            </div>

            <div className="console-detail-list">
              <div className="console-detail-item">
                <span>Owner email</span>
                <strong>{bootstrapStatus.bootstrapIdentity?.email ?? 'operator@local.approva'}</strong>
              </div>
              <div className="console-detail-item">
                <span>Display name</span>
                <strong>{bootstrapStatus.bootstrapIdentity?.name ?? 'Local operator'}</strong>
              </div>
            </div>

            <label className="field">
              <span>Owner password</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>

            <label className="field">
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
            </label>

            <div className="helper">
              Next, Approva will take you to Console Settings so you can add the first approval
              passkey and then open Users to add another owner.
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="actions">
              <button
                className="button primary"
                disabled={isPending}
                onClick={submitBootstrap}
                type="button"
              >
                {isPending ? 'Creating owner...' : 'Create owner and continue'}
              </button>
              <Link className="button ghost link-button" href="/">
                Back to landing
              </Link>
            </div>
          </>
        ) : bootstrapStatus ? (
          <>
            <div className="notice info">
              <strong>Local console sign-in</strong>
              <div>
                Use a local console user for this deployment. Approval passkeys do not sign you
                into the console.
              </div>
            </div>

            <label className="field">
              <span>Email</span>
              <input
                autoComplete="username"
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>

            {error ? <div className="error">{error}</div> : null}

            <div className="actions">
              <button
                className="button primary"
                disabled={isPending || email.trim().length === 0 || password.length === 0}
                onClick={submitLogin}
                type="button"
              >
                {isPending ? 'Signing in...' : 'Sign in'}
              </button>
              <Link className="button ghost link-button" href="/">
                Back to landing
              </Link>
            </div>
          </>
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="empty">Loading console authentication status...</div>
        )}
      </article>

      <aside className="card stack">
        <div>
          <div className="label">Auth model</div>
          <h2>Console sign-in and approval sign-in are separate</h2>
        </div>

        <div className="console-detail-list">
          <div className="console-detail-item">
            <span>Console auth</span>
            <strong>Local user session</strong>
          </div>
          <div className="console-detail-item">
            <span>Used for</span>
            <strong>Console pages, policies, integrations, machine access, ledger inspection</strong>
          </div>
          <div className="console-detail-item">
            <span>Approval auth</span>
            <strong>Secure approval link plus passkey-authenticated approver session</strong>
          </div>
        </div>

        <div className="console-detail-list">
          <div className="console-detail-item">
            <span>Step 1</span>
            <strong>Create the first console password</strong>
          </div>
          <div className="console-detail-item">
            <span>Step 2</span>
            <strong>Add the first approval passkey in Settings</strong>
          </div>
          <div className="console-detail-item">
            <span>Step 3</span>
            <strong>Add another owner in Users for day-to-day administration</strong>
          </div>
        </div>

        <Link className="button ghost link-button" href="/security">
          Security overview
        </Link>
        <Link className="button ghost link-button" href="/help#self-host">
          Self-host guide
        </Link>
      </aside>
    </section>
  );
}
