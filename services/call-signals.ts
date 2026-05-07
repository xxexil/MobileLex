export type CallMode = 'one-on-one' | 'group';
export type CallSignalType = 'invite' | 'decline';

export type CallSignal = {
  v: 1;
  type: CallSignalType;
  mode: CallMode;
  conversationId?: number;
  groupId?: number;
  title?: string;
  fromName?: string;
};

const PREFIX = '__LC_CALL__';

function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSignal(signal: any): CallSignal | null {
  if (!signal || typeof signal !== 'object') return null;
  if (signal.v !== 1) return null;
  if (signal.type !== 'invite' && signal.type !== 'decline') return null;
  if (signal.mode !== 'one-on-one' && signal.mode !== 'group') return null;

  return {
    v: 1,
    type: signal.type,
    mode: signal.mode,
    conversationId: toNumber(signal.conversationId),
    groupId: toNumber(signal.groupId),
    title: typeof signal.title === 'string' ? signal.title : undefined,
    fromName: typeof signal.fromName === 'string' ? signal.fromName : undefined,
  };
}

export function encodeCallSignal(signal: Omit<CallSignal, 'v'>): string {
  return `${PREFIX}${JSON.stringify({ v: 1, ...signal })}`;
}

export function parseCallSignal(body: unknown): CallSignal | null {
  if (typeof body !== 'string' || !body.startsWith(PREFIX)) return null;

  try {
    const parsed = JSON.parse(body.slice(PREFIX.length));
    return normalizeSignal(parsed);
  } catch {
    return null;
  }
}

export function toDisplayMessage(body: string): string {
  const signal = parseCallSignal(body);
  if (!signal) return body;

  if (signal.type === 'invite') {
    return signal.mode === 'group' ? 'Incoming group video call' : 'Incoming video call';
  }

  return signal.mode === 'group' ? 'Group call declined' : 'Call declined';
}
