const ACTIVE_CLIENT_BOOKING_STATUSES = new Set(['pending', 'upcoming']);

type ExistingConsultation = {
  id?: number | string;
  status?: string;
  scheduled_at?: string;
  duration_minutes?: number | string;
};

export const CLIENT_DOUBLE_BOOKING_MESSAGE = 'You already have a consultation scheduled at this time. Please choose another schedule.';

export function extractConsultationList(payload: any): ExistingConsultation[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.consultations)) return payload.consultations;
  if (Array.isArray(payload?.consultations?.data)) return payload.consultations.data;
  return [];
}

export function hasClientBookingConflict(
  consultations: ExistingConsultation[],
  proposedStart: Date,
  proposedDurationMinutes: number,
) {
  const proposedStartMs = proposedStart.getTime();
  if (!Number.isFinite(proposedStartMs)) return false;

  const proposedEndMs = proposedStartMs + Math.max(1, proposedDurationMinutes || 60) * 60 * 1000;

  return consultations.some((item) => {
    const status = String(item?.status ?? '').toLowerCase();
    if (!ACTIVE_CLIENT_BOOKING_STATUSES.has(status)) return false;

    const existingStartMs = new Date(item?.scheduled_at ?? '').getTime();
    if (!Number.isFinite(existingStartMs)) return false;

    const existingDuration = Number(item?.duration_minutes || 60);
    const existingEndMs = existingStartMs + Math.max(1, existingDuration || 60) * 60 * 1000;

    return proposedStartMs < existingEndMs && proposedEndMs > existingStartMs;
  });
}

