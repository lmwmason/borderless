import korean from '@/i18n/catalogs/legal.json';

const curated: Record<string, string> = korean;
const suffixes = [
  ' Source verification is stale or unavailable; recheck before relying on this finding.',
  ' Structured model review flagged a possible exception or disagreement; human review is required.'
];

/** Presentation only: never changes a finding, status, fact, source or stored text. */
export function legalText(original: string, locale: string): string {
  if (locale !== 'ko') return original;
  if (curated[original]) return curated[original];
  for (const suffix of suffixes) {
    if (original.endsWith(suffix)) {
      const base = original.slice(0, -suffix.length);
      const translated = legalText(base, locale);
      if (translated !== base) return translated + ' ' + curated[suffix.trim()];
    }
  }
  const confirm = /^Confirm ([A-Za-z]+) for (.+)\.$/.exec(original);
  if (confirm && curated[confirm[1]] && curated[confirm[2]])
    return `${curated[confirm[2]]}: ${curated[confirm[1]]}을(를) 확인하세요.`;
  const exception = /^Review possible exception involving ([A-Za-z]+) for (.+)\.$/.exec(original);
  if (exception && curated[exception[1]] && curated[exception[2]])
    return `${curated[exception[2]]}: ${curated[exception[1]]} 관련 예외 가능성을 검토하세요.`;
  return original;
}

export function generatedTaskTitle(title: string, locale: string): string {
  if (locale !== 'ko' || !title.startsWith('Review: ')) return title;
  const topic = title.slice('Review: '.length);
  return curated[topic] ? `검토: ${curated[topic]}` : title;
}
