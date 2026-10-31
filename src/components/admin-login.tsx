'use client';
import {useCopy,useLocalePath,persistLocalePreference} from '@/i18n/client';
import {useLocale,useFormatter} from 'next-intl';
import { useState } from 'react';
import { adminApi } from './admin-shared';
export function AdminLoginPage() {
    const t = useCopy("admin");
    const locale=useLocale();const localeHref=useLocalePath();const formatter=useFormatter();
    const [loginId, setLoginId] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function signIn() { setBusy(true); setError(''); try {
        await adminApi('/api/admin/login', 'POST', { loginId, password });
        setPassword('');
        await persistLocalePreference();
        window.location.assign(localeHref('/admin'));
    }
    catch (cause) {
        setPassword('');
        setError(cause instanceof Error ? cause.message : 'Admin sign-in failed.');
        setBusy(false);
    } }
    return <div className="public-shell"><header className="public-header"><a href={localeHref("/")} className="public-brand"><img src="/borderless-logo.png" alt="Borderless"/></a><a className="button" href={localeHref("/")}>{t("Company and expert accounts")}</a></header><main className="public-main"><section className="panel auth-card admin-login-card"><span className="eyebrow">{t("PLATFORM ADMINISTRATION")}</span><h1>{t("Admin Console sign in")}</h1><p>{t("Administrator access uses a separate login ID and password. Company and expert account sessions do not grant access to this console.")}</p>{error && <div className="alert error" role="alert">{t(error)}</div>}<form className="profile-form" onSubmit={e => { e.preventDefault(); void signIn(); }}><label className="full">{t("Admin login ID")}<input required autoComplete="username" maxLength={128} value={loginId} disabled={busy} onChange={e => setLoginId(e.target.value)}/></label><label className="full">{t("Admin password")}<input required autoComplete="current-password" type="password" maxLength={128} value={password} disabled={busy} onChange={e => setPassword(e.target.value)}/></label><button className="primary full" disabled={busy}>{busy ? t("Signing in\u2026") : t("Sign in to Admin Console")}</button></form><p className="footnote">{t("Use credentials issued through your administrator provisioning process. This page does not create administrator accounts.")}</p></section></main></div>;
}
