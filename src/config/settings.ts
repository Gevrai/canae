import type { AIDifficulty } from '../systems/AISystem';

export interface GameSettings {
  difficulty: AIDifficulty;
  soundEnabled: boolean;
  fullscreen: boolean;
}

const STORAGE_KEY = 'canae_settings';

const DEFAULT_SETTINGS: GameSettings = {
  difficulty: 'normal',
  soundEnabled: true,
  fullscreen: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}
