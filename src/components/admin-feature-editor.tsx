'use client';
import {useCopy,useLocalePath} from '@/i18n/client';
import {useLocale,useFormatter} from 'next-intl';
import { FEATURE_REGISTRY, type FeatureFlags, type FeatureLimits } from '@/lib/entitlements/registry';
export const LIMIT_LABELS: Record<keyof FeatureLimits, string> = { members: 'Member limit', projects: 'Project limit', monthlyDeepReviews: 'Monthly Deep Review limit' };
export function AdminFeatureLimitEditor({ features, limits, onFeatures, onLimits, disabled = false }: {
    features: FeatureFlags;
    limits: FeatureLimits;
    onFeatures: (value: FeatureFlags) => void;
    onLimits: (value: FeatureLimits) => void;
    disabled?: boolean;
}) {
    const t = useCopy("admin");
    const locale=useLocale();const localeHref=useLocalePath();const formatter=useFormatter();
    return <><h3 className="full">{t("Features")}</h3><p className="footnote full">{t("Only selected features are included. Dependency requirements are validated on the server.")}</p>{FEATURE_REGISTRY.map(feature => <label className="checkbox-label full contract-feature" key={feature.id}><input disabled={disabled} type="checkbox" checked={features[feature.id]} onChange={e => onFeatures({ ...features, [feature.id]: e.target.checked })}/><span><strong>{t(feature.label)}</strong><small>{t(feature.description)}</small>{feature.dependencies.length > 0 && <small>{"" + t("Requires") + " "}{feature.dependencies.map(id => t(FEATURE_REGISTRY.find(item => item.id === id)?.label || id)).join(', ')}</small>}</span></label>)}<h3 className="full">{t("Limits")}</h3>{(Object.keys(LIMIT_LABELS) as (keyof FeatureLimits)[]).map(key => <label key={key}>{t(LIMIT_LABELS[key])}<input disabled={disabled} required type="number" min={0} max={1000000} step={1} value={limits[key]} onChange={e => onLimits({ ...limits, [key]: Number(e.target.value) })}/></label>)}</>;
}
