'use client';
import {useCopy,useLocalePath} from '@/i18n/client';
import {useLocale,useFormatter} from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AdminHeader, type AdminSession } from './admin-shared';
import {OrganizationLogo} from './organization-logo';
import type {OrganizationLogoMetadata} from '@/lib/organization-contracts';
type LegacyStatus = 'Pending' | 'In Review' | 'Closed' | 'Approved' | 'Rejected';
type SalesStatus = 'New' | 'Contacted' | 'Negotiating' | 'Won' | 'Lost';
type Assignee = {
    id: string;
    name: string;
    email: string;
};
type Inquiry = {
    id: string;
    organizationId: string;
    companyName: string;
    organizationLogo?: OrganizationLogoMetadata | null;
    requesterName: string;
    requesterEmail: string;
    notes: string;
    status: LegacyStatus;
    createdAt: string;
    updatedAt?: string;
    reviewedAt: string | null;
    reviewNotes: string;
    salesStatus?: SalesStatus;
    assigneeId?: string | null;
    assigneeName?: string | null;
};
type SalesNote = {
    id: string;
    authorId: string;
    authorName: string;
    body: string;
    createdAt: string;
};
type SalesActivity = {
    id: string;
    actorId: string;
    actorName: string;
    action: string;
    detail: Record<string, unknown>;
    createdAt: string;
};
type Notification = {
    id: string;
    inquiryId: string;
    event: string;
    channel: 'slack';
    status: 'Pending' | 'Sent' | 'Failed' | 'Retry Scheduled' | 'Disabled';
    attempts: number;
    nextAttemptAt: string | null;
    lastError: string | null;
    errorCategory: string | null;
    uncertain: boolean;
    createdAt: string;
    updatedAt: string;
    sentAt: string | null;
    canRetry: boolean;
};
type Detail = {
    inquiry: Inquiry;
    notes: SalesNote[];
    activity: SalesActivity[];
    notifications: Notification[];
};
const salesStatuses: SalesStatus[] = ['New', 'Contacted', 'Negotiating', 'Won', 'Lost'];
class InboxError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}
async function inboxApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin' });
    let data: any;
    try {
        data = await response.json();
    }
    catch {
        throw new InboxError('The server returned an invalid response.', response.status);
    }
    if (!response.ok)
        throw new InboxError(data.error?.message || 'The operator inbox request failed.', response.status);
    return data as T;
}

export function OperatorInquiriesPage() {
    const t = useCopy("admin");
    const eventLabel=(value:string)=>t(value);const locale=useLocale();const localeHref=useLocalePath();const formatter=useFormatter();
    const [phase, setPhase] = useState<'loading' | 'allowed' | 'signin' | 'restricted' | 'unavailable'>('loading'), [inquiries, setInquiries] = useState<Inquiry[]>([]), [assignees, setAssignees] = useState<Assignee[]>([]), [detail, setDetail] = useState<Detail | null>(null), [salesFilter, setSalesFilter] = useState('all'), [assigneeFilter, setAssigneeFilter] = useState('all'), [legacyFilter, setLegacyFilter] = useState('all'), [searchDraft, setSearchDraft] = useState(''), [search, setSearch] = useState('');
    const [salesStatus, setSalesStatus] = useState<SalesStatus>('New'), [assigneeId, setAssigneeId] = useState(''), [note, setNote] = useState(''), [legacyNext, setLegacyNext] = useState('In Review'), [legacyNotes, setLegacyNotes] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const epoch = useRef(0), linkOpened = useRef(false);
    const selected = detail?.inquiry;
    function clearData() { setInquiries([]); setAssignees([]); setDetail(null); setNote(''); setLegacyNotes(''); }
    function fail(cause: unknown) { clearData(); setNotice(''); setError(cause instanceof Error ? cause.message : 'The inbox is unavailable.'); setPhase(cause instanceof InboxError && cause.status === 401 ? 'signin' : cause instanceof InboxError && cause.status === 403 ? 'restricted' : 'unavailable'); }
    function applyDetail(data: Detail) { setDetail({ ...data, notes: data.notes || [], activity: data.activity || [], notifications: data.notifications || [] }); setSalesStatus(data.inquiry.salesStatus || 'New'); setAssigneeId(data.inquiry.assigneeId || ''); setNote(''); setLegacyNotes(data.inquiry.reviewNotes); setLegacyNext(data.inquiry.status === 'In Review' ? 'Closed' : 'In Review'); }
    async function load(reopenId?: string) {
        const current = ++epoch.current;
        setBusy(true);
        setError('');
        clearData();
        setPhase('loading');
        try {
            const account = await inboxApi<AdminSession>('/api/admin/session');
            if (current !== epoch.current)
                return;
            if (!account.user) {
                clearData();
                setPhase('signin');
                return;
            }
            const params = new URLSearchParams();
            if (salesFilter !== 'all')
                params.set('salesStatus', salesFilter);
            if (legacyFilter !== 'all')
                params.set('status', legacyFilter);
            if (assigneeFilter !== 'all')
                params.set('assigneeId', assigneeFilter);
            if (search)
                params.set('q', search);
            const data = await inboxApi<{
                inquiries: Inquiry[];
                assignees?: Assignee[];
            }>('/api/admin/inquiries' + (params.size ? '?' + params : ''));
            if (current !== epoch.current)
                return;
            setInquiries(data.inquiries);
            setAssignees(data.assignees || []);
            setPhase('allowed');
            const requested = new URLSearchParams(window.location.search).get('inquiryId');
            const openId = reopenId || (!linkOpened.current && requested && data.inquiries.some(item => item.id === requested) ? requested : undefined);
            if (!linkOpened.current) {
                linkOpened.current = true;
                if (requested && !data.inquiries.some(item => item.id === requested))
                    setNotice('The requested inquiry is not in the current authorized results. Adjust the search or filters.');
            }
            if (openId) {
                const next = await inboxApi<Detail>('/api/admin/inquiries/' + encodeURIComponent(openId));
                if (current === epoch.current)
                    applyDetail(next);
            }
        }
        catch (cause) {
            if (current === epoch.current)
                fail(cause);
        }
        finally {
            if (current === epoch.current)
                setBusy(false);
        }
    }
    useEffect(() => { void load(); return () => { epoch.current++; }; }, [salesFilter, assigneeFilter, legacyFilter, search]);
    async function open(id: string) {
        const current = ++epoch.current;
        setBusy(true);
        setDetail(null);
        setError('');
        setNotice('');
        try {
            const data = await inboxApi<Detail>('/api/admin/inquiries/' + encodeURIComponent(id));
            if (current === epoch.current)
                applyDetail(data);
        }
        catch (cause) {
            if (current === epoch.current)
                fail(cause);
        }
        finally {
            if (current === epoch.current)
                setBusy(false);
        }
    }
    async function mutate(path: string, method: string, body: unknown, message: string) {
        if (!selected)
            return;
        const id = selected.id, current = ++epoch.current;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await inboxApi(path, method, body);
            if (current !== epoch.current)
                return;
            await load(id);
            setNotice(message);
        }
        catch (cause) {
            if (current === epoch.current)
                fail(cause);
        }
        finally {
            if (current === epoch.current)
                setBusy(false);
        }
    }
    const legacyTerminal = selected && ['Closed', 'Rejected', 'Approved'].includes(selected.status);
    const legacyOptions = selected?.status === 'Pending' ? ['In Review', 'Closed', 'Rejected'] : selected?.status === 'In Review' ? ['Closed', 'Rejected'] : selected ? [selected.status] : [];
    const salesChanged = selected && (salesStatus !== selected.salesStatus || assigneeId !== (selected.assigneeId || ''));
    function activityValue(key: string, value: unknown): string { if (value && typeof value === 'object' && !Array.isArray(value) && ('before' in value || 'after' in value)) {
        const change = value as {
            before?: unknown;
            after?: unknown;
        };
        return activityValue(key, change.before) + ' → ' + activityValue(key, change.after);
    } if (value === null || value === undefined)
        return t(key.toLowerCase().includes('assignee') ? 'Unassigned' : 'Not recorded'); if (typeof value === 'string' && key.toLowerCase().includes('assignee'))
        return assignees.find(person => person.id === value)?.name || t('Former operator ({id})',{id:value}); if (Array.isArray(value))
        return value.map(item => activityValue(key, item)).join(', '); return typeof value === 'object' ? JSON.stringify(value) : ['from','to','salesStatus','fromSalesStatus','toSalesStatus','status'].includes(key)?t(String(value)):String(value); }
    return <div className="account-shell"><AdminHeader /><main className="account-main sales-crm-main"><span className="eyebrow">{t("PLATFORM OPERATIONS \u00B7 ENTERPRISE SALES")}</span><div className="page-heading"><div><h1>{t("Enterprise inquiry inbox")}</h1><p>{t("Track sales ownership, conversations and delivery state without changing paid entitlements.")}</p></div><button disabled={busy} onClick={() => void load(selected?.id)}>{t("Refresh inquiries")}</button></div>{error && <div className="alert error" role="alert">{t(error)}</div>}{notice && <div className="alert success" role="status">{t(notice)}</div>}{phase === 'loading' ? <section className="panel empty-state" role="status">{t("Checking operator access and loading inquiries\u2026")}</section> : phase === 'signin' ? <section className="panel account-panel"><h2>{t("Admin sign-in required")}</h2><p>{t("This inbox requires a separate authorized administrator session.")}</p><a className="button" href={localeHref("/admin/login")}>{t("Open admin sign in")}</a></section> : phase === 'restricted' ? <section className="panel account-panel"><h2>{t("Operator access required")}</h2><p>{t("Company and expert account roles do not grant Admin Console access. Sign in with separately provisioned administrator credentials.")}</p><p>{t("Inquiry data, notes, activity and notification records have been cleared from this page.")}</p></section> : phase === 'unavailable' ? <section className="panel account-panel"><h2>{t("Inbox unavailable")}</h2><p>{t("Inquiry data has been cleared. Retry the connection to load an authorized, current view.")}</p></section> : <>
 <div className="alert">{t("Won records a sales outcome only. It does not confirm payment, execute a contract or activate a subscription. Notification delivery is tracked separately and requires explicit configuration and authorization.")}</div>
 <form className="sales-search" onSubmit={e => { e.preventDefault(); if (searchDraft.trim() === search)
            void load();
        else
            setSearch(searchDraft.trim()); }}><label>{t("Search enterprise inquiries")}<input disabled={busy} value={searchDraft} onChange={e => setSearchDraft(e.target.value)} placeholder={t("Company, requester or inquiry text")}/></label><button disabled={busy} className="primary">{t("Search inquiries")}</button></form>
 <div className="sales-filters"><label>{t("Sales pipeline filter")}<select disabled={busy} value={salesFilter} onChange={e => setSalesFilter(e.target.value)}><option value="all">{t("All sales stages")}</option>{salesStatuses.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label><label>{t("Assignee filter")}<select disabled={busy} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}><option value="all">{t("All assignees")}</option><option value="unassigned">{t("Unassigned")}</option>{assignees.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label><label>{t("Inquiry status filter")}<select disabled={busy} value={legacyFilter} onChange={e => setLegacyFilter(e.target.value)}><option value="all">{t("All legacy review states")}</option>{['Pending', 'In Review', 'Closed', 'Approved', 'Rejected'].map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label><span>{inquiries.length}{" " + t("inquiries") + ""}</span></div>
 <div className="inquiry-workspace"><section className="panel table-scroll"><table className="inquiry-table"><thead><tr><th>{t("Company / requester")}</th><th>{t("Sales stage")}</th><th>{t("Assignee")}</th><th>{t("Submitted")}</th></tr></thead><tbody>{inquiries.map(inquiry => <tr key={inquiry.id}><td><div style={{display:"flex",alignItems:"center",gap:10}}><OrganizationLogo organizationId={inquiry.organizationId} name={inquiry.companyName} logo={inquiry.organizationLogo} admin decorative size={36}/><button disabled={busy} className="table-link" onClick={() => void open(inquiry.id)}>{inquiry.companyName}</button></div><small className="block muted">{inquiry.requesterName}</small><small className="block muted">{inquiry.requesterEmail}</small></td><td><span className={'sales-stage ' + (inquiry.salesStatus || '').toLowerCase()}>{inquiry.salesStatus?t(inquiry.salesStatus):t("Not recorded")}</span><small className="block muted">{"" + t("Legacy review:") + " "}{t(inquiry.status)}</small></td><td>{inquiry.assigneeName || t("Unassigned")}</td><td>{formatter.dateTime(new Date(inquiry.createdAt),{dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table>{!inquiries.length && <div className="empty-state">{t("No inquiries match the current search and filters.")}</div>}</section>
 {selected && detail ? <section className="panel account-panel inquiry-detail" aria-label={t("Selected enterprise inquiry")}><span className="eyebrow">{selected.salesStatus || t("Sales stage not recorded")}</span><div style={{display:"flex",alignItems:"center",gap:16,margin:"12px 0"}}><OrganizationLogo organizationId={selected.organizationId} name={selected.companyName} logo={selected.organizationLogo} admin size={56}/><h2>{selected.companyName}</h2></div><dl className="fact-list"><div><dt>{t("Requester")}</dt><dd>{selected.requesterName}</dd></div><div><dt>{t("Contact email")}</dt><dd><a href={'mailto:' + encodeURIComponent(selected.requesterEmail)}>{selected.requesterEmail}</a></dd></div><div><dt>{t("Submitted")}</dt><dd>{formatter.dateTime(new Date(selected.createdAt),{dateStyle:'medium',timeStyle:'short'})}</dd></div><div><dt>{t("Sales assignee")}</dt><dd>{selected.assigneeName || t("Unassigned")}</dd></div></dl><h3>{t("Submitted inquiry")}</h3><p className="preserve-text">{selected.notes}</p><p className="footnote">{t("Company and requester details are the server-recorded submission snapshot. Opening the contact email is a user action; this page does not send email automatically.")}</p>
 <form className="profile-form sales-pipeline-form" onSubmit={e => { e.preventDefault(); void mutate('/api/admin/inquiries/' + encodeURIComponent(selected.id), 'PATCH', { salesStatus, assigneeId: assigneeId || null }, 'Sales pipeline updated. No subscription or contract was activated.'); }}><h3 className="full">{t("Sales pipeline and ownership")}</h3><label>{t("Sales stage")}<select disabled={busy} value={salesStatus} onChange={e => setSalesStatus(e.target.value as SalesStatus)}>{salesStatuses.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label><label>{t("Sales assignee")}<select disabled={busy} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="">{t("Unassigned")}</option>{assignees.map(person => <option value={person.id} key={person.id}>{person.name} · {person.email}</option>)}</select></label><button disabled={busy || !salesChanged} className="primary full">{t("Save sales pipeline")}</button>{salesStatus === 'Won' && <p className="full footnote">{t("Won does not create a contract, a verified payment or a paid subscription.")}</p>}</form>
 <section className="sales-notes"><h3>{t("Sales notes")}</h3>{detail.notes.length ? detail.notes.map(item => <article key={item.id}><p className="preserve-text">{item.body}</p><small>{item.authorName} · {formatter.dateTime(new Date(item.createdAt),{dateStyle:'medium',timeStyle:'short'})}</small></article>) : <p className="muted">{t("No sales notes yet.")}</p>}<form className="profile-form" onSubmit={e => { e.preventDefault(); void mutate('/api/admin/inquiries/' + encodeURIComponent(selected.id) + '/notes', 'POST', { body: note }, 'Sales note recorded.'); }}><label className="full">{t("New sales note")}<textarea disabled={busy} required rows={4} maxLength={5000} value={note} onChange={e => setNote(e.target.value)}/></label><button disabled={busy || !note.trim()} className="primary full">{t("Add sales note")}</button></form></section>
 <section className="sales-notifications"><h3>{t("Notification delivery")}</h3>{detail.notifications.length ? detail.notifications.map(item => <article key={item.id}><div className="notification-heading"><strong>{"" + t("Slack \u00B7") + " "}{t(item.status)}</strong><span>{item.attempts}{" " + t("attempts") + ""}</span></div><p>{eventLabel(item.event)}</p>{item.sentAt && <p>{"" + t("Sent") + " "}{formatter.dateTime(new Date(item.sentAt),{dateStyle:'medium',timeStyle:'short'})}</p>}{item.nextAttemptAt && <p>{"" + t("Next attempt") + " "}{formatter.dateTime(new Date(item.nextAttemptAt),{dateStyle:'medium',timeStyle:'short'})}</p>}{item.lastError && <p className="notification-error">{t(item.lastError)}</p>}{item.uncertain && <div className="alert">{t("The previous delivery result is uncertain. A retry may create a duplicate notification. Check the destination before retrying.")}</div>}{item.status === 'Disabled' && !item.canRetry && <p>{t("Delivery is disabled. Configuration and explicit operator approval are required before retry.")}</p>}<button disabled={busy || !item.canRetry} onClick={() => void mutate('/api/admin/inquiries/' + encodeURIComponent(selected.id) + '/notifications/' + encodeURIComponent(item.id) + '/retry', 'POST', {}, 'Notification retry requested. Check the recorded delivery state.')}>{t("Retry notification")}</button></article>) : <p className="muted">{t("No notification record is available. Delivery has not been verified from this view.")}</p>}</section>
 <section className="sales-activity"><h3>{t("Sales activity")}</h3>{detail.activity.length ? <ol>{detail.activity.map(item => <li key={item.id}><strong>{eventLabel(item.action)}</strong><small>{item.actorName} · {formatter.dateTime(new Date(item.createdAt),{dateStyle:'medium',timeStyle:'short'})}</small>{Object.entries(item.detail || {}).filter(([key]) => ['from', 'to', 'salesStatus', 'fromSalesStatus', 'toSalesStatus', 'assigneeId', 'previousAssigneeId', 'notificationId', 'status', 'attempt', 'noteId'].includes(key)).map(([key, value]) => <span key={key}>{eventLabel(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}: {activityValue(key, value)}</span>)}</li>)}</ol> : <p className="muted">{t("No sales activity is recorded.")}</p>}</section>
 <details className="legacy-review"><summary>{t("Legacy operator review")}</summary><p className="footnote">{t("This earlier request-handling state is separate from the sales pipeline and paid entitlements.")}</p><form className="profile-form" onSubmit={e => { e.preventDefault(); void mutate('/api/admin/inquiries/' + encodeURIComponent(selected.id), 'PATCH', { status: legacyNext, notes: legacyNotes }, 'Inquiry review updated. No payment, contract or paid activation was performed.'); }}><label className="full">{t("Operator review status")}<select disabled={busy || !!legacyTerminal} value={legacyTerminal ? selected.status : legacyNext} onChange={e => setLegacyNext(e.target.value)}>{legacyOptions.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label><label className="full">{t("Operator review notes")}<textarea disabled={busy || !!legacyTerminal} required rows={5} maxLength={5000} value={legacyNotes} onChange={e => setLegacyNotes(e.target.value)}/></label><button className="primary full" disabled={busy || !!legacyTerminal}>{t("Save inquiry review")}</button>{legacyTerminal && <p className="footnote full">{t("Closed, rejected and legacy approved review records are read-only.")}</p>}</form></details>
 </section> : <section className="panel empty-state"><h3>{busy ? t("Loading inquiry details\u2026") : t("Select an inquiry.")}</h3><p>{t("Review the submitted company, sales history and notification records before taking action.")}</p></section>}</div></>}<footer>{t("Platform operator access is explicitly authorized on the server.")}<span>{t("Sales outcomes do not activate paid access.")}</span></footer></main></div>;
}
