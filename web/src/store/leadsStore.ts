import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Lead, LeadStatus, LeadFinding, LeadTouch, LeadTier } from '../types';
import { addDays } from '../lib/time';
import { useSettingsStore } from './settingsStore';

interface LeadsState {
  leads: Lead[];
  blacklist: string[]; // ignored channelIds
  deletedLeadIds: string[];
  searchHistory: string[]; // last 10 search queries
  selectedLeadId: string | null;
  lastCloudSyncAt: string | null;
  isSyncingCloud: boolean;

  // Actions
  setSelectedLeadId: (id: string | null) => void;
  setIsSyncingCloud: (syncing: boolean) => void;
  applyCloudSyncState: (cloudState: {
    leads?: Lead[];
    blacklist?: string[];
    deletedLeadIds?: string[];
    syncedAt?: string;
  }) => void;
  addLead: (lead: Partial<Lead> & { name: string; channelUrl: string }) => void;
  addLeads: (leads: Array<Partial<Lead> & { name: string; channelUrl: string }>) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  deleteLeads: (ids: string[]) => void;
  updateLeadStatus: (id: string, newStatus: LeadStatus) => void;
  updateLeadTier: (id: string, tier: LeadTier) => void;
  updateLeadAiScore: (
    id: string,
    aiData: {
      fit_score: number;
      reason: string;
      opening_angle: string;
      pain_hypotheses?: string[];
      is_business?: boolean;
      monetization?: 'product' | 'ads_only' | 'unclear';
      awareness?: 'unaware' | 'problem' | 'solution' | 'product';
      cacheKey?: string;
    }
  ) => void;
  getAiExamples: () => {
    good: Array<{ title: string; description: string; subscribers: number; niche: string }>;
    bad: Array<{ title: string; description: string; subscribers: number; niche: string }>;
  };
  bulkUpdateStatus: (ids: string[], newStatus: LeadStatus) => void;
  bulkUpdateTier: (ids: string[], tier: LeadTier) => void;

  addFinding: (leadId: string, timecode: string, note: string) => void;
  removeFinding: (leadId: string, findingId: string) => void;

  addTouch: (leadId: string, touch: Omit<LeadTouch, 'id' | 'at'> & { at?: string }) => void;
  scheduleNextTouch: (leadId: string, daysAhead: number) => void;

  addToBlacklist: (channelId: string) => void;
  removeFromBlacklist: (channelId: string) => void;
  isBlacklisted: (channelId: string) => boolean;

  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  clearAllLeads: () => void;
  importLeads: (imported: Lead[]) => void;
}

export const useLeadsStore = create<LeadsState>()(
  persist(
    (set, get) => ({
      leads: [],
      blacklist: [],
      deletedLeadIds: [],
      searchHistory: [
        'ai automation',
        'saas marketing',
        'uk business podcast',
        'бизнес казахстан',
      ],
      selectedLeadId: null,
      lastCloudSyncAt: null,
      isSyncingCloud: false,

      setSelectedLeadId: (id) => set({ selectedLeadId: id }),
      setIsSyncingCloud: (isSyncingCloud) => set({ isSyncingCloud }),
      applyCloudSyncState: (cloudState) =>
        set((state) => {
          const mergedDeleted = Array.from(
            new Set([...(state.deletedLeadIds || []), ...(cloudState.deletedLeadIds || [])])
          ).slice(-500);
          const deletedSet = new Set(mergedDeleted);
          const mergedBlacklist = Array.from(
            new Set([...(state.blacklist || []), ...(cloudState.blacklist || [])])
          );
          const nextLeads = Array.isArray(cloudState.leads)
            ? cloudState.leads.filter((l) => l && !deletedSet.has(l.id))
            : state.leads.filter((l) => !deletedSet.has(l.id));

          return {
            leads: nextLeads,
            blacklist: mergedBlacklist,
            deletedLeadIds: mergedDeleted,
            lastCloudSyncAt: cloudState.syncedAt || new Date().toISOString(),
          };
        }),

      addLead: (leadData) => {
        const id = leadData.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        // Check if already exists by channelId or channelUrl
        const exists = get().leads.some(
          (l) => (leadData.channelId && l.channelId === leadData.channelId) || l.channelUrl === leadData.channelUrl
        );
        if (exists) return;

        const nowIso = new Date().toISOString();
        const newLead: Lead = {
          id,
          name: leadData.name || 'Без названия',
          channelUrl: leadData.channelUrl || '',
          channelId: leadData.channelId,
          avatar: leadData.avatar,
          subscribers: leadData.subscribers || 0,
          hiddenSubscribers: Boolean(leadData.hiddenSubscribers),
          niche: leadData.niche || 'Видеомонтаж',
          tier: leadData.tier || 2,
          score: leadData.score || 50,
          source: leadData.source || 'Вручную',
          email: leadData.email || null,
          telegram: leadData.telegram || null,
          instagram: leadData.instagram || null,
          website: leadData.website || null,
          lastVideo: leadData.lastVideo || null,
          hasProduct: Boolean(leadData.hasProduct),
          findings: leadData.findings || [],
          status: leadData.status || 'new',
          firstTouchAt: leadData.firstTouchAt || null,
          nextTouchAt: leadData.nextTouchAt || null,
          touchesCount: leadData.touchesCount || 0,
          touches: leadData.touches || [],
          dealValue: leadData.dealValue || 600,
          currency: leadData.currency || 'USD',
          tags: leadData.tags || [],
          notes: leadData.notes || '',
          createdAt: leadData.createdAt || nowIso,
          updatedAt: leadData.updatedAt || nowIso,
          region: leadData.region,
          sourcePlatform: leadData.sourcePlatform,
          connectsSpent: leadData.connectsSpent,
          upworkMeta: leadData.upworkMeta,
        };

        set((state) => ({
          leads: [newLead, ...state.leads],
          deletedLeadIds: (state.deletedLeadIds || []).filter((d) => d !== id),
        }));
      },

      addLeads: (leadsData) => {
        const current = get().leads;
        const newItems: Lead[] = [];
        const nowIso = new Date().toISOString();

        for (const ld of leadsData) {
          const exists =
            current.some((l) => (ld.channelId && l.channelId === ld.channelId) || l.channelUrl === ld.channelUrl) ||
            newItems.some((l) => (ld.channelId && l.channelId === ld.channelId) || l.channelUrl === ld.channelUrl);
          if (exists) continue;

          newItems.push({
            id: ld.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: ld.name || 'Без названия',
            channelUrl: ld.channelUrl || '',
            channelId: ld.channelId,
            avatar: ld.avatar,
            subscribers: ld.subscribers || 0,
            hiddenSubscribers: Boolean(ld.hiddenSubscribers),
            niche: ld.niche || 'Видеомонтаж',
            tier: ld.tier || 2,
            score: ld.score || 50,
            source: ld.source || 'YouTube Search',
            email: ld.email || null,
            telegram: ld.telegram || null,
            instagram: ld.instagram || null,
            website: ld.website || null,
            lastVideo: ld.lastVideo || null,
            hasProduct: Boolean(ld.hasProduct),
            findings: ld.findings || [],
            status: ld.status || 'new',
            firstTouchAt: ld.firstTouchAt || null,
            nextTouchAt: ld.nextTouchAt || null,
            touchesCount: ld.touchesCount || 0,
            touches: ld.touches || [],
            dealValue: ld.dealValue || 600,
            currency: ld.currency || 'USD',
            tags: ld.tags || [],
            notes: ld.notes || '',
            createdAt: ld.createdAt || nowIso,
            updatedAt: ld.updatedAt || nowIso,
            region: ld.region,
            sourcePlatform: ld.sourcePlatform,
            connectsSpent: ld.connectsSpent,
            upworkMeta: ld.upworkMeta,
          });
        }

        set((state) => ({ leads: [...newItems, ...state.leads] }));
      },

      updateLead: (id, updates) =>
        set((state) => ({
          leads: state.leads.map((l) =>
            l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
          ),
        })),

      deleteLead: (id) =>
        set((state) => ({
          leads: state.leads.filter((l) => l.id !== id),
          deletedLeadIds: Array.from(new Set([...(state.deletedLeadIds || []), id])).slice(-500),
          selectedLeadId: state.selectedLeadId === id ? null : state.selectedLeadId,
        })),

      deleteLeads: (ids) =>
        set((state) => ({
          leads: state.leads.filter((l) => !ids.includes(l.id)),
          deletedLeadIds: Array.from(new Set([...(state.deletedLeadIds || []), ...ids])).slice(-500),
          selectedLeadId: ids.includes(state.selectedLeadId || '') ? null : state.selectedLeadId,
        })),

      updateLeadStatus: (id, newStatus) => {
        const lead = get().leads.find((l) => l.id === id);
        if (!lead) return;

        const nowIso = new Date().toISOString();
        const settings = useSettingsStore.getState();
        const intervals = settings.followUpIntervals || [2, 2, 3];

        const updates: Partial<Lead> = { status: newStatus, updatedAt: nowIso };

        // Automation rules:
        if (newStatus === 'messaged') {
          // If moving to 'messaged' for the first time
          if (!lead.firstTouchAt) {
            updates.firstTouchAt = nowIso;
          }
          // Increment daily sent counter
          settings.incrementSentCount();

          // Schedule next follow-up in +2 days (interval 0)
          const daysToAdd = intervals[0] || 2;
          updates.nextTouchAt = addDays(daysToAdd);
          updates.touchesCount = (lead.touchesCount || 0) + 1;

          // Add a default touch history record if not already recorded
          if (lead.touches.length === 0) {
            updates.touches = [
              {
                id: `touch_${Date.now()}`,
                at: nowIso,
                channel: lead.telegram ? 'Telegram' : lead.email ? 'Email' : 'Other',
                note: 'Первое касание отправлено',
                replied: false,
              },
            ];
          }
        } else if (newStatus === 'replied' || newStatus === 'closed') {
          updates.outcome = 'good';
        } else if (newStatus === 'followup') {
          // Subsequent followup touch
          const currentTouch = lead.touchesCount || 1;
          const nextTouchIndex = Math.min(currentTouch, intervals.length - 1);
          const daysToAdd = intervals[nextTouchIndex] || 2;
          updates.nextTouchAt = addDays(daysToAdd);
          updates.touchesCount = currentTouch + 1;
        } else if (newStatus === 'rejected') {
          updates.nextTouchAt = null;
          // Feedback loop: if rejected after 3+ touches without reply, outcome="bad"
          if ((lead.touchesCount || 0) >= 3) {
            updates.outcome = 'bad';
          }
        }

        set((state) => ({
          leads: state.leads.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        }));
      },

      updateLeadAiScore: (id, aiData) => {
        const lead = get().leads.find((l) => l.id === id);
        if (!lead) return;

        const ruleScore = lead.ruleScore ?? lead.score;
        const fit_score = Math.max(0, Math.min(100, Math.round(aiData.fit_score)));
        const combinedScore = Math.round(0.4 * ruleScore + 0.6 * fit_score);

        let tier: LeadTier = 3;
        if (combinedScore >= 70) tier = 1;
        else if (combinedScore >= 45) tier = 2;
        else tier = 3;

        set((state) => ({
          leads: state.leads.map((l) =>
            l.id === id
              ? {
                  ...l,
                  ruleScore,
                  score: combinedScore,
                  tier,
                  aiScore: fit_score,
                  aiReason: aiData.reason,
                  aiAngle: aiData.opening_angle,
                  aiPainHypotheses: aiData.pain_hypotheses || [],
                  aiIsBusiness: aiData.is_business,
                  aiMonetization: aiData.monetization,
                  aiAwareness: aiData.awareness,
                  aiAnalyzedAt: new Date().toISOString(),
                  aiCacheKey: aiData.cacheKey,
                }
              : l
          ),
        }));
      },

      getAiExamples: () => {
        const leads = get().leads;
        const good = leads
          .filter((l) => l.outcome === 'good')
          .slice(0, 3)
          .map((l) => ({
            title: l.name,
            description: l.notes || l.lastVideo?.title || l.niche,
            subscribers: l.subscribers,
            niche: l.niche,
          }));
        const bad = leads
          .filter((l) => l.outcome === 'bad')
          .slice(0, 3)
          .map((l) => ({
            title: l.name,
            description: l.notes || l.lastVideo?.title || l.niche,
            subscribers: l.subscribers,
            niche: l.niche,
          }));
        return { good, bad };
      },

      updateLeadTier: (id, tier) =>
        set((state) => ({
          leads: state.leads.map((l) => (l.id === id ? { ...l, tier, updatedAt: new Date().toISOString() } : l)),
        })),

      bulkUpdateStatus: (ids, newStatus) => {
        ids.forEach((id) => get().updateLeadStatus(id, newStatus));
      },

      bulkUpdateTier: (ids, tier) =>
        set((state) => ({
          leads: state.leads.map((l) => (ids.includes(l.id) ? { ...l, tier, updatedAt: new Date().toISOString() } : l)),
        })),

      addFinding: (leadId, timecode, note) => {
        const id = `f_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
        const finding: LeadFinding = { id, timecode, note };
        set((state) => ({
          leads: state.leads.map((l) =>
            l.id === leadId ? { ...l, findings: [...l.findings, finding], updatedAt: new Date().toISOString() } : l
          ),
        }));
      },

      removeFinding: (leadId, findingId) =>
        set((state) => ({
          leads: state.leads.map((l) =>
            l.id === leadId
              ? { ...l, findings: l.findings.filter((f) => f.id !== findingId), updatedAt: new Date().toISOString() }
              : l
          ),
        })),

      addTouch: (leadId, touch) => {
        const nowIso = new Date().toISOString();
        const fullTouch: LeadTouch = {
          id: `touch_${Date.now()}`,
          at: touch.at || nowIso,
          channel: touch.channel,
          note: touch.note,
          replied: touch.replied,
        };
        set((state) => ({
          leads: state.leads.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  touches: [...l.touches, fullTouch],
                  touchesCount: (l.touchesCount || 0) + 1,
                  updatedAt: nowIso,
                }
              : l
          ),
        }));
      },

      scheduleNextTouch: (leadId, daysAhead) =>
        set((state) => ({
          leads: state.leads.map((l) =>
            l.id === leadId ? { ...l, nextTouchAt: addDays(daysAhead), updatedAt: new Date().toISOString() } : l
          ),
        })),

      addToBlacklist: (channelId) =>
        set((state) => ({
          blacklist: state.blacklist.includes(channelId)
            ? state.blacklist
            : [...state.blacklist, channelId],
          leads: state.leads.filter((l) => l.channelId !== channelId),
        })),

      removeFromBlacklist: (channelId) =>
        set((state) => ({
          blacklist: state.blacklist.filter((id) => id !== channelId),
        })),

      isBlacklisted: (channelId) => get().blacklist.includes(channelId),

      addSearchHistory: (query) => {
        const clean = query.trim();
        if (!clean) return;
        set((state) => {
          const filtered = state.searchHistory.filter((q) => q.toLowerCase() !== clean.toLowerCase());
          return { searchHistory: [clean, ...filtered].slice(0, 10) };
        });
      },

      clearSearchHistory: () => set({ searchHistory: [] }),

      clearAllLeads: () => set({ leads: [], selectedLeadId: null }),

      importLeads: (imported) => set({ leads: imported }),
    }),
    {
      name: 'leadhunter_leads',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2 && persistedState) {
          if (Array.isArray(persistedState.leads)) {
            persistedState.leads = persistedState.leads.filter(
              (l: any) => l && typeof l === 'object' && !l.id?.startsWith('demo_')
            );
          }
        }
        return persistedState;
      },
      // Automatically purge any old demo leads from localStorage
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.leads)) {
          state.leads = state.leads.filter((l) => !l.id?.startsWith('demo_')).slice(0, 500);
        }
      },
    }
  )
);
