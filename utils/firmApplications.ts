export type FirmApplicationLike = Record<string, any>;

export function extractApplicationList(payload: any): FirmApplicationLike[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.applications)) return payload.applications;
  if (Array.isArray(payload?.pending_applications)) return payload.pending_applications;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function getApplicationLawyer(application: FirmApplicationLike) {
  return application?.lawyer ?? application?.applicant ?? application?.user ?? {};
}

export function getApplicationLawyerId(application: FirmApplicationLike) {
  const lawyer = getApplicationLawyer(application);
  return Number(application?.lawyer_id ?? lawyer?.id ?? lawyer?.user_id ?? 0) || 0;
}

export function getApplicationLawyerName(application: FirmApplicationLike) {
  const lawyer = getApplicationLawyer(application);
  return String(lawyer?.name ?? application?.lawyer_name ?? application?.applicant_name ?? 'This lawyer');
}

export function getAcceptedFirmName(application: FirmApplicationLike) {
  const lawyer = getApplicationLawyer(application);
  const candidates = [
    application?.accepted_firm_name,
    application?.accepted_law_firm_name,
    application?.accepted_firm?.firm_name,
    application?.accepted_firm?.name,
    application?.current_firm_name,
    application?.current_law_firm_name,
    application?.current_firm?.firm_name,
    application?.current_firm?.name,
    lawyer?.accepted_firm_name,
    lawyer?.current_firm_name,
    lawyer?.current_law_firm_name,
    lawyer?.law_firm_name,
    lawyer?.firm_name,
    lawyer?.firm?.firm_name,
    lawyer?.firm?.name,
    lawyer?.law_firm?.firm_name,
    lawyer?.law_firm?.name,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

export function isAcceptedElsewhereApplication(application: FirmApplicationLike) {
  const status = String(application?.status ?? application?.application_status ?? '').toLowerCase();
  if (['accepted_elsewhere', 'already_accepted', 'joined_other_firm', 'withdrawn_elsewhere'].includes(status)) {
    return true;
  }

  if (application?.accepted_elsewhere === true || application?.lawyer_accepted_elsewhere === true) {
    return true;
  }

  const applicationFirmId = Number(application?.law_firm_id ?? application?.firm_id ?? 0);
  const lawyer = getApplicationLawyer(application);
  const lawyerFirmId = Number(
    lawyer?.law_firm_id
      ?? lawyer?.firm_id
      ?? lawyer?.current_firm_id
      ?? application?.lawyer_law_firm_id
      ?? application?.lawyer_firm_id
      ?? 0
  );

  if (applicationFirmId > 0 && lawyerFirmId > 0 && applicationFirmId !== lawyerFirmId) {
    return true;
  }

  return status === 'pending' && Boolean(getAcceptedFirmName(application));
}

export function buildAcceptedElsewhereActivity(application: FirmApplicationLike) {
  const lawyerId = getApplicationLawyerId(application);
  const lawyerName = getApplicationLawyerName(application);
  const firmName = getAcceptedFirmName(application) || 'another law firm';
  const activityId = `firm-application-accepted-elsewhere-${lawyerId || application?.id || lawyerName}`;

  return {
    id: activityId,
    kind: 'firm-application-accepted-elsewhere',
    title: 'Lawyer Accepted Elsewhere',
    body: `${lawyerName} has already been accepted to ${firmName}. Their pending application here no longer needs review.`,
    tone: 'warning' as const,
    icon: 'briefcase-outline',
    routeKind: 'team' as const,
  };
}
