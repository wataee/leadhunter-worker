import {
  jsonResponse,
  errorResponse,
  handleOptions,
  validatePayloadSize,
  fetchWithTimeout,
  type NetlifyResponse,
} from './_shared/response';
import { requireAuth } from './_shared/auth';

interface HandlerEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

export interface SyncLeadItem {
  id: string;
  channelUrl?: string;
  updatedAt?: string;
  createdAt?: string;
  touches?: Array<{ id?: string; at?: string; channel?: string; note?: string; replied?: boolean }>;
  findings?: Array<{ id?: string; timecode?: string; note?: string }>;
  [key: string]: unknown;
}

export interface CrmSyncState {
  updatedAt: string;
  leads: SyncLeadItem[];
  blacklist: string[];
  hiddenChannels: string[];
  deletedLeadIds: string[];
}

const CRM_REDIS_KEY = 'leadhunter:crm_state:v1';

let memoryCrmState: CrmSyncState = {
  updatedAt: '',
  leads: [],
  blacklist: [],
  hiddenChannels: [],
  deletedLeadIds: [],
};

export function resetMemoryCrmStateForTests(): void {
  memoryCrmState = {
    updatedAt: '',
    leads: [],
    blacklist: [],
    hiddenChannels: [],
    deletedLeadIds: [],
  };
}

function getLeadRecencyMs(lead: SyncLeadItem): number {
  const candidates: number[] = [];
  if (lead.updatedAt) {
    const t = Date.parse(lead.updatedAt);
    if (!Number.isNaN(t)) candidates.push(t);
  }
  if (Array.isArray(lead.touches)) {
    for (const touch of lead.touches) {
      if (touch?.at) {
        const t = Date.parse(touch.at);
        if (!Number.isNaN(t)) candidates.push(t);
      }
    }
  }
  if (lead.createdAt) {
    const t = Date.parse(lead.createdAt);
    if (!Number.isNaN(t)) candidates.push(t);
  }
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function mergeArrayByKey<T extends Record<string, unknown>>(
  a: T[] = [],
  b: T[] = [],
  getKey: (item: T) => string
): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    if (!item || typeof item !== 'object') continue;
    const key = getKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

export function mergeCrmStates(server: CrmSyncState, incoming: Partial<CrmSyncState>): CrmSyncState {
  const deletedSet = new Set<string>([
    ...(Array.isArray(server.deletedLeadIds) ? server.deletedLeadIds : []),
    ...(Array.isArray(incoming.deletedLeadIds) ? incoming.deletedLeadIds : []),
  ]);
  const deletedLeadIds = Array.from(deletedSet).slice(-500);

  const blacklist = Array.from(
    new Set([
      ...(Array.isArray(server.blacklist) ? server.blacklist : []),
      ...(Array.isArray(incoming.blacklist) ? incoming.blacklist : []),
    ].filter((x) => typeof x === 'string' && x.trim()))
  );

  const hiddenChannels = Array.from(
    new Set(
      [
        ...(Array.isArray(server.hiddenChannels) ? server.hiddenChannels : []),
        ...(Array.isArray(incoming.hiddenChannels) ? incoming.hiddenChannels : []),
      ]
        .filter((x) => typeof x === 'string' && x.trim())
        .map((x) => x.toLowerCase().replace(/^@/, '').trim())
    )
  );

  const leadMap = new Map<string, SyncLeadItem>();
  const urlToIdMap = new Map<string, string>();

  const ingest = (rawLead: SyncLeadItem) => {
    if (!rawLead || typeof rawLead !== 'object' || !rawLead.id) return;
    if (deletedSet.has(rawLead.id)) return;

    const normUrl = typeof rawLead.channelUrl === 'string' ? rawLead.channelUrl.trim() : '';
    const existingByUrlId = normUrl ? urlToIdMap.get(normUrl) : undefined;
    const canonicalId = leadMap.has(rawLead.id)
      ? rawLead.id
      : existingByUrlId || rawLead.id;

    const existing = leadMap.get(canonicalId);
    if (!existing) {
      leadMap.set(canonicalId, rawLead);
      if (normUrl) urlToIdMap.set(normUrl, canonicalId);
      return;
    }

    const existingMs = getLeadRecencyMs(existing);
    const incomingMs = getLeadRecencyMs(rawLead);
    const winner = incomingMs >= existingMs ? rawLead : existing;
    const loser = incomingMs >= existingMs ? existing : rawLead;

    const mergedTouches = mergeArrayByKey(
      winner.touches || [],
      loser.touches || [],
      (t) => String(t.id || `${t.at || ''}:${t.note || ''}`)
    );
    const mergedFindings = mergeArrayByKey(
      winner.findings || [],
      loser.findings || [],
      (f) => String(f.id || `${f.timecode || ''}:${f.note || ''}`)
    );

    leadMap.set(canonicalId, {
      ...loser,
      ...winner,
      id: canonicalId,
      touches: mergedTouches,
      touchesCount: Math.max(
        Number(winner.touchesCount || 0),
        Number(loser.touchesCount || 0),
        mergedTouches.length
      ),
      findings: mergedFindings,
    });
  };

  for (const lead of Array.isArray(server.leads) ? server.leads : []) {
    ingest(lead);
  }
  for (const lead of Array.isArray(incoming.leads) ? incoming.leads : []) {
    ingest(lead);
  }

  const leads = Array.from(leadMap.values())
    .sort((a, b) => getLeadRecencyMs(b) - getLeadRecencyMs(a))
    .slice(0, 500);

  return {
    updatedAt: new Date().toISOString(),
    leads,
    blacklist,
    hiddenChannels,
    deletedLeadIds,
  };
}

async function readCloudState(redisUrl?: string, redisToken?: string): Promise<CrmSyncState> {
  if (!redisUrl || !redisToken) {
    return memoryCrmState;
  }

  try {
    const res = await fetchWithTimeout(
      `${redisUrl.replace(/\/$/, '')}/get/${encodeURIComponent(CRM_REDIS_KEY)}`,
      {
        headers: { Authorization: `Bearer ${redisToken}` },
      },
      5000
    );
    if (!res.ok) return memoryCrmState;
    const data = await res.json();
    if (!data?.result) return memoryCrmState;
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    if (parsed && typeof parsed === 'object') {
      return {
        updatedAt: String(parsed.updatedAt || ''),
        leads: Array.isArray(parsed.leads) ? parsed.leads : [],
        blacklist: Array.isArray(parsed.blacklist) ? parsed.blacklist : [],
        hiddenChannels: Array.isArray(parsed.hiddenChannels) ? parsed.hiddenChannels : [],
        deletedLeadIds: Array.isArray(parsed.deletedLeadIds) ? parsed.deletedLeadIds : [],
      };
    }
  } catch {
    // Fallback to memory state on Redis outage
  }
  return memoryCrmState;
}

async function writeCloudState(
  state: CrmSyncState,
  redisUrl?: string,
  redisToken?: string
): Promise<boolean> {
  memoryCrmState = state;
  if (!redisUrl || !redisToken) return true;

  try {
    const res = await fetchWithTimeout(
      redisUrl.replace(/\/$/, ''),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', CRM_REDIS_KEY, JSON.stringify(state)]),
      },
      5000
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function handler(event: HandlerEvent): Promise<NetlifyResponse> {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  const auth = requireAuth(event);
  if (!auth.authenticated) {
    return errorResponse(auth.statusCode || 401, auth.error || 'Требуется авторизация', null, origin);
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const redisConfigured = Boolean(redisUrl && redisToken);

  if (event.httpMethod === 'GET') {
    const state = await readCloudState(redisUrl, redisToken);
    return jsonResponse(200, { ok: true, redisConfigured, state }, origin);
  }

  if (event.httpMethod === 'POST') {
    const sizeCheck = validatePayloadSize(event.body, 512 * 1024);
    if (!sizeCheck.valid) {
      return errorResponse(400, sizeCheck.error || 'Слишком большой payload CRM', null, origin);
    }

    let body: Partial<CrmSyncState>;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return errorResponse(400, 'Некорректный JSON в crm-sync', null, origin);
    }

    const currentServerState = await readCloudState(redisUrl, redisToken);
    const mergedState = mergeCrmStates(currentServerState, body);
    const saved = await writeCloudState(mergedState, redisUrl, redisToken);

    return jsonResponse(
      200,
      {
        ok: true,
        redisConfigured,
        persistedToRedis: redisConfigured && saved,
        syncedAt: mergedState.updatedAt,
        state: mergedState,
      },
      origin
    );
  }

  return errorResponse(405, 'Метод не поддерживается', null, origin);
}
