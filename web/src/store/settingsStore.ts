import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserSettings, UserProfile } from '../types';
import { getTodayDateString } from '../lib/time';

interface SettingsState extends UserSettings {
  updateProfile: (profileUpdates: Partial<UserProfile>) => void;
  setDailyGoal: (goal: number) => void;
  incrementSentCount: () => void;
  resetDailyIfNewDay: () => void;
  setFollowUpIntervals: (intervals: number[]) => void;
  setDuplicateToTelegram: (enabled: boolean) => void;
  setAutoRefreshInterval: (interval: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setUseAiQualification: (enabled: boolean) => void;
  setAiTopNCount: (count: number) => void;
  setAutoTranslateVacancies: (enabled: boolean) => void;
  setCustomAiApiKey: (key: string) => void;
  setCustomAiProvider: (provider: 'gemini' | 'groq' | 'openrouter') => void;
  setQuietHours: (enabled: boolean, start?: number, end?: number) => void;
  addQuotaUsed: (units: number) => void;
  resetQuota: () => void;
  resetAllSettings: () => void;
}

const DEFAULT_PROFILE: UserProfile = {
  name: 'Timur (.fleur)',
  specialization: 'AI, Tech & Finance Video Editing (YouTube + Reels/Shorts)',
  telegram: '@ffluere',
  portfolioUrl: 'https://fleur-editor.netlify.app/',
  email: 'fluere.work@gmail.com',
  sampleUrl: 'https://youtu.be/cZZgi5xn930',
  formats: ['YouTube', 'Shorts/Reels', 'Подкасты'],
  skills: ['After Effects', 'Premiere Pro', 'DaVinci Resolve'],
  minRate: 80,
  minRateShorts: 30,
  minRateLong: 80,
  minRateCurrency: 'USD',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      dailyGoal: 15,
      todaySentCount: 0,
      lastSentDate: getTodayDateString(),
      followUpIntervals: [2, 2, 3],
      duplicateToTelegram: false,
      autoRefreshInterval: 2, // 2 minutes
      soundEnabled: true,
      notificationsEnabled: false,
      sessionQuotaUsed: 0,
      useAiQualification: true,
      aiTopNCount: 30,
      autoTranslateVacancies: true,
      customAiApiKey: '',
      customAiProvider: 'gemini',
      setAutoTranslateVacancies: (autoTranslateVacancies: boolean) => set({ autoTranslateVacancies }),
      setCustomAiApiKey: (customAiApiKey: string) => set({ customAiApiKey }),
      setCustomAiProvider: (customAiProvider: 'gemini' | 'groq' | 'openrouter') =>
        set({ customAiProvider }),
      quietHoursEnabled: false,
      quietHoursStart: 23,
      quietHoursEnd: 8,

      updateProfile: (updates) =>
        set((state) => ({
          profile: {
            ...state.profile,
            ...updates,
            // Программы жестко зафиксированы за тремя ключевыми редакторами
            skills: ['After Effects', 'Premiere Pro', 'DaVinci Resolve'],
          },
        })),

      setDailyGoal: (dailyGoal) => set({ dailyGoal }),

      incrementSentCount: () => {
        get().resetDailyIfNewDay();
        set((state) => ({
          todaySentCount: state.todaySentCount + 1,
        }));
      },

      resetDailyIfNewDay: () => {
        const today = getTodayDateString();
        if (get().lastSentDate !== today) {
          set({
            todaySentCount: 0,
            lastSentDate: today,
          });
        }
      },

      setFollowUpIntervals: (followUpIntervals) => set({ followUpIntervals }),
      setDuplicateToTelegram: (duplicateToTelegram) => set({ duplicateToTelegram }),
      setAutoRefreshInterval: (autoRefreshInterval) => set({ autoRefreshInterval }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setUseAiQualification: (useAiQualification) => set({ useAiQualification }),
      setAiTopNCount: (aiTopNCount) => set({ aiTopNCount }),
      setQuietHours: (quietHoursEnabled, quietHoursStart = 23, quietHoursEnd = 8) =>
        set({ quietHoursEnabled, quietHoursStart, quietHoursEnd }),

      addQuotaUsed: (units) =>
        set((state) => ({
          sessionQuotaUsed: state.sessionQuotaUsed + units,
        })),

      resetQuota: () => set({ sessionQuotaUsed: 0 }),

      resetAllSettings: () =>
        set({
          profile: DEFAULT_PROFILE,
          dailyGoal: 15,
          todaySentCount: 0,
          lastSentDate: getTodayDateString(),
          followUpIntervals: [2, 2, 3],
          duplicateToTelegram: false,
          autoRefreshInterval: 2,
          soundEnabled: true,
          notificationsEnabled: false,
          sessionQuotaUsed: 0,
          useAiQualification: true,
          aiTopNCount: 30,
          autoTranslateVacancies: true,
        }),
    }),
    {
      name: 'leadhunter_settings',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (persistedState) {
          const p = persistedState.profile || {};
          if (version < 2) {
            if (p.telegram === '@editor_timur') p.telegram = DEFAULT_PROFILE.telegram;
            if (p.email === 'editor.timur@gmail.com') p.email = DEFAULT_PROFILE.email;
            if (p.sampleUrl === 'https://youtu.be/sample_edit') p.sampleUrl = DEFAULT_PROFILE.sampleUrl;
            if (p.portfolioUrl === 'https://fleur-editor.netlify.app/ru/') p.portfolioUrl = DEFAULT_PROFILE.portfolioUrl;
            if (p.name === 'Тимур') p.name = DEFAULT_PROFILE.name;
            if (p.minRate === 3000 && p.minRateCurrency === 'RUB') {
              p.minRate = DEFAULT_PROFILE.minRate;
              p.minRateCurrency = DEFAULT_PROFILE.minRateCurrency;
            }
          }
          if (version < 3) {
            p.skills = ['After Effects', 'Premiere Pro', 'DaVinci Resolve'];
            if (!p.minRateShorts) p.minRateShorts = DEFAULT_PROFILE.minRateShorts || 30;
            if (!p.minRateLong) p.minRateLong = p.minRate || DEFAULT_PROFILE.minRateLong || 80;
          }
          persistedState.profile = { ...DEFAULT_PROFILE, ...p };
          if (persistedState.autoTranslateVacancies === undefined) {
            persistedState.autoTranslateVacancies = true;
          }
        }
        return persistedState;
      },
    }
  )
);
