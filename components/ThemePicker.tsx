'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';
const validTheme = (value: string | null | undefined): Theme => value === 'light' || value === 'dark' ? value : 'system';

export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(validTheme(document.documentElement.dataset.theme));
    const sync = (event: StorageEvent) => {
      if (event.key !== 'atlas-theme' && event.key !== null) return;
      const next = validTheme(event.newValue);
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const changeTheme = (value: string) => {
    const next = validTheme(value);
    document.documentElement.dataset.theme = next;
    setTheme(next);
    // The control also works when the browser disallows persistent storage.
    try { localStorage.setItem('atlas-theme', next); } catch { /* Session-only preference. */ }
  };
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return <label className="theme-picker" title="Apariencia de ATLAS">
    <Icon size={15} aria-hidden="true" />
    <select aria-label="Apariencia" value={theme} onChange={event => changeTheme(event.target.value)}>
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Oscuro</option>
    </select>
  </label>;
}
