import { useCallback, useState } from 'react';
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied('failed:' + key);
    }
    window.setTimeout(() => setCopied((c) => (c && c.endsWith(key) ? null : c)), 1600);
  }, []);
  return { copied, copy };
}
