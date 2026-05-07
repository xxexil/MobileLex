type RoomMode = 'conversation' | 'group' | 'consultation';

type BuildRoomNameParams = {
  mode: RoomMode;
  conversationId?: string | number | null;
  groupId?: string | number | null;
  consultationCode?: string | null;
};

function clean(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (normalized || 'room').slice(0, 60);
}

export function buildVideoRoomName(params: BuildRoomNameParams) {
  const prefix = 'lexconnect';

  if (params.consultationCode) {
    return `LexConnect-${String(params.consultationCode).trim()}`;
  }

  if (params.mode === 'group') {
    return `${prefix}-group-${clean(String(params.groupId ?? 'general'))}`;
  }

  return `${prefix}-conversation-${clean(String(params.conversationId ?? 'direct'))}`;
}
