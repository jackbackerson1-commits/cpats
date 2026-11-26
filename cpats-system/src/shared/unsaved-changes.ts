export interface GuardedLink { href: string; target?: string; download?: boolean; button?: number; modified?: boolean }
export function shouldGuardLink(link: GuardedLink, current: string): boolean {
  if (link.download || link.modified || (link.button ?? 0) !== 0 || (link.target && link.target !== '_self')) return false;
  try {
    const from = new URL(current), to = new URL(link.href, current);
    if (!['http:', 'https:'].includes(to.protocol)) return false;
    if (to.origin === from.origin && to.pathname === from.pathname && to.search === from.search && to.hash) return false;
    return true;
  } catch { return false; }
}
export interface FormSnapshot { scope: string; value: string }
export function hasUnsavedFormChanges(baseline: FormSnapshot, scope: string, value: string): boolean {
  return baseline.scope === scope && baseline.value !== value;
}
