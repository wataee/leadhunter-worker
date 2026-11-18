import { postCrmSync, CrmSyncResponse } from './api';
import { useLeadsStore } from '../store/leadsStore';
import { useVacanciesStore } from '../store/vacanciesStore';

let activeSyncPromise: Promise<CrmSyncResponse | null> | null = null;

/**
 * Synchronizes CRM leads, blacklist, deletions, and hidden channels with Upstash Redis cloud state.
 */
export async function syncCrmWithCloud(): Promise<CrmSyncResponse | null> {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    const leadsStore = useLeadsStore.getState();
    const vacanciesStore = useVacanciesStore.getState();
    leadsStore.setIsSyncingCloud(true);

    try {
      const res = await postCrmSync({
        leads: leadsStore.leads,
        blacklist: leadsStore.blacklist,
        deletedLeadIds: leadsStore.deletedLeadIds || [],
        hiddenChannels: vacanciesStore.hiddenChannels || [],
      });

      if (res?.ok && res.state) {
        leadsStore.applyCloudSyncState({
          leads: res.state.leads,
          blacklist: res.state.blacklist,
          deletedLeadIds: res.state.deletedLeadIds,
          syncedAt: res.syncedAt || res.state.updatedAt,
        });

        if (Array.isArray(res.state.hiddenChannels)) {
          for (const ch of res.state.hiddenChannels) {
            if (!vacanciesStore.hiddenChannels.includes(ch)) {
              vacanciesStore.hideChannel(ch);
            }
          }
        }
      }

      return res;
    } catch {
      return null;
    } finally {
      useLeadsStore.getState().setIsSyncingCloud(false);
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
