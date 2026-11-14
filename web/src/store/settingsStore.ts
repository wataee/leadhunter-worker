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
  addQuotaUsed: (units: number) => void;
  resetQuota: () => void;
  resetAllSettings: () => void;
}

const DEFAULT_PROFILE: UserProfile = {
  name: 'Тимур',
  specialization: 'Динамичный YouTube-монтаж (MrBeast / Vox style)',
  telegram: '@editor_timur',
  portfolioUrl: 'https://fleur-editor.netlify.app/ru/',
  email: 'editor.timur@gmail.com',
  sampleUrl: 'https://youtu.be/sample_edit',
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

      updateProfile: (updates) =>
        set((state) => ({
          profile: { ...state.profile, ...updates },
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
        }),
    }),
    {
      name: 'leadhunter_settings',
    }
  )
);
