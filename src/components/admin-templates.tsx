'use client';
import {useCopy,useLocalePath} from '@/i18n/client';
import {useLocale,useFormatter} from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EMPTY_FEATURES, FEATURE_REGISTRY, type TemplateDTO, type TemplateInput } from '@/lib/entitlements/registry';
import { AdminHeader, adminApi, AdminApiError, type AdminSession } from './admin-shared';
import { AdminFeatureLimitEditor, LIMIT_LABELS } from './admin-feature-editor';
type TemplateDetail = {
    template: TemplateDTO;
    versions: {
        version: number;
        createdAt: string;
        createdBy: string;
        payload: TemplateInput;
    }[];
    applications: {
        organizationId: string;
        organizationName: string;
        contractId: string;
        contractVersion: number;
        templateVersion: number;
        createdAt: string;
        status: string;
    }[];
};
const blank = (): TemplateInput => ({ name: '', description: '', features: { ...EMPTY_FEATURES }, limits: { members: 0, projects: 0, monthlyDeepReviews: 0 }, defaultDurationDays: 30, notes: '' });
const editable = (template: TemplateDTO): TemplateInput => ({ name: template.name, description: template.description, features: { ...template.features }, limits: { ...template.limits }, defaultDurationDays: template.defaultDurationDays, notes: template.notes });
export function AdminTemplatesPage() {
    const t = useCopy("admin");
    const locale=useLocale();const localeHref=useLocalePath();const formatter=useFormatter();
    const [templates, setTemplates] = useState<TemplateDTO[]>([]), [detail, setDetail] = useState<TemplateDetail | null>(null), [draft, setDraft] = useState<TemplateInput>(blank), [phase, setPhase] = useState<'loading' | 'allowed' | 'signin' | 'restricted' | 'unavailable'>('loading'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [statusFilter, setStatusFilter] = useState('all'), [search, setSearch] = useState(''), [cloneName, setCloneName] = useState(''), [nextStatus, setNextStatus] = useState<'Active' | 'Inactive' | 'Archived'>('Inactive'), [statusReason, setStatusReason] = useState('');
    const epoch = useRef(0);
    function clear() { setTemplates([]); setDetail(null); setDraft(blank()); setCloneName(''); setStatusReason(''); }
    function fail(cause: unknown) { clear(); setNotice(''); setError(cause instanceof Error ? cause.message : 'Templates could not be loaded.'); setPhase(cause instanceof AdminApiError && cause.status === 401 ? 'signin' : cause instanceof AdminApiError && cause.status === 403 ? 'restricted' : 'unavailable'); }
    function apply(data: TemplateDetail) { setDetail(data); setDraft(editable(data.template)); setCloneName(data.template.name.slice(0, 155) + ' copy'); setStatusReason(''); setNextStatus(data.template.status === 'Active' ? 'Inactive' : 'Active'); }
    async function load(id?: string) { const current = ++epoch.current; setBusy(true); setError(''); try {
        const session = await adminApi<AdminSession>('/api/admin/session');
        if (current !== epoch.current)
            return;
        if (!session.user) {
            clear();
            setPhase('signin');
            return;
        }
        const data = await adminApi<{
            templates: TemplateDTO[];
        }>('/api/admin/subscription-templates');
        if (current !== epoch.current)
            return;
        setTemplates(data.templates);
        setPhase('allowed');
        if (id) {
            const next = await adminApi<TemplateDetail>('/api/admin/subscription-templates/' + encodeURIComponent(id));
            if (current === epoch.current)
                apply(next);
        }
    }
    catch (cause) {
        if (current === epoch.current)
            fail(cause);
    }
    finally {
        if (current === epoch.current)
            setBusy(false);
    } }
    useEffect(() => { void load(); return () => { epoch.current++; }; }, []);
    async function open(id: string) { const current = ++epoch.current; setBusy(true); setError(''); setDetail(null); try {
        const data = await adminApi<TemplateDetail>('/api/admin/subscription-templates/' + encodeURIComponent(id));
        if (current === epoch.current)
            apply(data);
    }
    catch (cause) {
        if (current === epoch.current)
            fail(cause);
    }
    finally {
        if (current === epoch.current)
            setBusy(false);
    } }
    async function save() { const current = ++epoch.current; setBusy(true); setError(''); setNotice(''); try {
        const saved = await adminApi<TemplateDTO>(detail ? '/api/admin/subscription-templates/' + encodeURIComponent(detail.template.id) : '/api/admin/subscription-templates', detail ? 'PATCH' : 'POST', detail ? { ...draft, expectedVersion: detail.template.version } : draft);
        if (current !== epoch.current)
            return;
        await load(saved.id);
        setNotice('Template configuration saved as a versioned record. Existing organization contracts were not changed.');
    }
    catch (cause) {
        if (current === epoch.current) {
            if (cause instanceof AdminApiError && (cause.status === 401 || cause.status === 403))
                fail(cause);
            else
                setError(cause instanceof Error ? cause.message : 'Template save failed. Reload the template before retrying a version conflict.');
        }
    }
    finally {
        if (current === epoch.current)
            setBusy(false);
    } }
    async function mutate(path: string, body: unknown, message: string, clone = false) { const current = ++epoch.current; setBusy(true); setError(''); setNotice(''); try {
        const result = await adminApi<TemplateDTO>(path, 'POST', body);
        if (current !== epoch.current)
            return;
        await load(clone ? result.id : detail?.template.id);
        setNotice(message);
    }
    catch (cause) {
        if (current === epoch.current) {
            if (cause instanceof AdminApiError && (cause.status === 401 || cause.status === 403))
                fail(cause);
            else
                setError(cause instanceof Error ? cause.message : 'Template action failed.');
        }
    }
    finally {
        if (current === epoch.current)
            setBusy(false);
    } }
    const archived = detail?.template.status === 'Archived';
    const visible = templates.filter(template => (statusFilter === 'all' || template.status === statusFilter) && (template.name + ' ' + template.description).toLowerCase().includes(search.toLowerCase()));
    return <div className="account-shell"><AdminHeader /><main className="account-main admin-console-main"><span className="eyebrow">{t("PLATFORM ADMINISTRATION \u00B7 SUBSCRIPTION TEMPLATES")}</span><div className="page-heading"><div><h1>{t("Subscription templates")}</h1><p>{t("Reusable configuration drafts. Selecting or editing a template never changes an organization contract automatically.")}</p></div><button disabled={busy} onClick={() => void load(detail?.template.id)}>{t("Refresh templates")}</button></div>{error && <div className="alert error" role="alert">{t(error)}</div>}{notice && <div className="alert success" role="status">{t(notice)}</div>}{phase === 'loading' ? <section className="panel empty-state" role="status">{t("Loading authorized template records\u2026")}</section> : phase !== 'allowed' ? <section className="panel account-panel"><h2>{phase === 'signin' ? t("Admin sign-in required") : phase === 'restricted' ? t("Administrator access required") : t("Templates unavailable")}</h2><p>{t("Template data has been cleared. Sign in with a separately authorized administrator account.")}</p><a className="button" href={localeHref("/admin/login")}>{t("Open admin sign in")}</a></section> : <>
 <div className="alert">{t("Templates supply editable defaults only. Every organization application still requires a contract preview, reviewed changes and explicit approval. Inactive or archived templates cannot be applied to new proposals.")}</div><div className="toolbar"><label>{t("Search templates")}<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>{t("Template status filter")}<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">{t("All statuses")}</option><option value="Active">{t("Active")}</option><option value="Inactive">{t("Inactive")}</option><option value="Archived">{t("Archived")}</option></select></label><button disabled={busy} onClick={() => { setDetail(null); setDraft(blank()); setNotice('New template draft. No organization has been changed.'); }}>{t("New template")}</button></div>
 <section className="panel table-scroll"><table><thead><tr><th>{t("Template")}</th><th>{t("Status / version")}</th><th>{t("Default duration")}</th><th>{t("Updated")}</th></tr></thead><tbody>{visible.map(template => <tr key={template.id}><td><button disabled={busy} className="table-link" onClick={() => void open(template.id)}>{template.name}</button><small className="block muted">{template.description}</small></td><td>{t(template.status)}{" " + t("\u00B7 v") + ""}{template.version}</td><td>{template.defaultDurationDays}{" " + t("days") + ""}</td><td>{formatter.dateTime(new Date(template.updatedAt),{dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table>{!visible.length && <div className="empty-state">{t("No template records match these filters.")}</div>}</section>
 <section className="panel account-panel template-editor" aria-label={t("Template configuration")}><span className="eyebrow">{detail ? t('TEMPLATE VERSION {version}',{version:detail.template.version}) : t("NEW TEMPLATE DRAFT")}</span><h2>{detail ? detail.template.name : t("Create a reusable template")}</h2><form className="profile-form" onSubmit={e => { e.preventDefault(); void save(); }}><label className="full">{t("Template name")}<input required disabled={busy} maxLength={160} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label className="full">{t("Template description")}<textarea disabled={busy} rows={3} maxLength={5000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><label className="full">{t("Default contract duration (days)")}<input required disabled={busy} type="number" min={1} max={3660} step={1} value={draft.defaultDurationDays} onChange={e => setDraft({ ...draft, defaultDurationDays: Number(e.target.value) })}/></label><AdminFeatureLimitEditor features={draft.features} limits={draft.limits} onFeatures={features => setDraft({ ...draft, features })} onLimits={limits => setDraft({ ...draft, limits })} disabled={busy}/><label className="full">{t("Template scope notes")}<textarea disabled={busy} rows={4} maxLength={10000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label><button className="primary full" disabled={busy}>{t("Save template version")}</button>{archived && <p className="footnote full">{t("Archived templates cannot be applied to new contracts. Editing or reactivating a template does not change existing approved contracts.")}</p>}</form>
 {detail && <><form className="profile-form activation-panel" onSubmit={e => { e.preventDefault(); void mutate('/api/admin/subscription-templates/' + encodeURIComponent(detail.template.id) + '/clone', { name: cloneName }, 'Template cloned into a separate record. No organization contract was changed.', true); }}><label className="full">{t("Clone template name")}<input required disabled={busy} maxLength={160} value={cloneName} onChange={e => setCloneName(e.target.value)}/></label><button disabled={busy} className="full">{t("Clone template")}</button></form><form className="profile-form activation-panel" onSubmit={e => { e.preventDefault(); void mutate('/api/admin/subscription-templates/' + encodeURIComponent(detail.template.id) + '/status', { status: nextStatus, reason: statusReason }, 'Template availability updated. Existing approved organization contracts are unchanged.'); }}><h3 className="full">{t("Template availability")}</h3><label>{t("New template status")}<select disabled={busy} value={nextStatus} onChange={e => setNextStatus(e.target.value as typeof nextStatus)}><option value="Active">{t("Active")}</option><option value="Inactive">{t("Inactive")}</option><option value="Archived">{t("Archived")}</option></select></label><label className="full">{t("Template status reason")}<textarea required disabled={busy} rows={3} maxLength={5000} value={statusReason} onChange={e => setStatusReason(e.target.value)}/></label><button disabled={busy || nextStatus === detail.template.status} className="full">{t("Update template status")}</button></form>
 <h3 className="section-gap">{t("Version history")}</h3>{detail.versions.map(version => <details className="template-version" key={version.version}><summary>{"" + t("Version") + " "}{version.version} · {formatter.dateTime(new Date(version.createdAt),{dateStyle:'medium',timeStyle:'short'})}</summary><p>{version.payload.description}</p><p>{"" + t("Enabled features:") + " "}{FEATURE_REGISTRY.filter(feature => version.payload.features[feature.id]).map(feature => t(feature.label)).join(', ') || t("None")}</p>{Object.entries(LIMIT_LABELS).map(([key, label]) => <p key={key}>{t(label)}: {version.payload.limits[key as keyof typeof version.payload.limits]}</p>)}<p>{"" + t("Default duration:") + " "}{version.payload.defaultDurationDays}{" " + t("days") + ""}</p></details>)}
 <h3 className="section-gap">{t("Organization application history")}</h3>{detail.applications.length ? <div className="table-scroll"><table><thead><tr><th>{t("Organization")}</th><th>{t("Template / contract version")}</th><th>{t("Contract state")}</th><th>{t("Applied")}</th></tr></thead><tbody>{detail.applications.map(application => <tr key={application.contractId}><td><a href={localeHref('/admin?' + new URLSearchParams({ organizationId: application.organizationId, contractId: application.contractId }))}>{application.organizationName}</a></td><td>{t("Template v")}{application.templateVersion}{" " + t("\u00B7 Contract v") + ""}{application.contractVersion}</td><td>{t(application.status)}</td><td>{formatter.dateTime(new Date(application.createdAt),{dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table></div> : <p>{t("No approved organization applications are recorded for this template.")}</p>}</>}
 </section></>}<footer>{t("Templates are versioned defaults, not executed agreements.")}<span>{t("Organization changes always require a separate preview and approval.")}</span></footer></main></div>;
}
