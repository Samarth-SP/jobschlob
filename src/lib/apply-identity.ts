// Contact/eligibility facts the local BoofSimplify worker's deterministic field-mapping needs —
// see boof/apply/mapping.py's build_facts(). Stored in profiles.identity as camelCase (idiomatic
// for this codebase); toBoofIdentity() below converts to the exact snake_case shape
// boof/profile/schema.py's EMPTY["identity"] defines, which is the wire protocol the two apps
// share — those keys are deliberately NOT renamed to match jobschlob's own conventions, since
// BoofSimplify reads them directly.
export type ApplyIdentity = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: { linkedin?: string; github?: string; portfolio?: string; scholar?: string; other?: string };
  workAuthorization?: string;
  requiresSponsorship?: boolean | null;
  willingToRelocate?: boolean | null;
  remotePreference?: string;
  desiredCompensation?: string;
  earliestStart?: string;
  noticePeriod?: string;
  pronouns?: string;
  eeo?: { gender?: string; race?: string; veteran?: string; disability?: string; hispanic?: string };
};

export function toBoofIdentity(identity: ApplyIdentity | null | undefined): Record<string, unknown> {
  const i = identity ?? {};
  return {
    full_name: i.fullName ?? "",
    email: i.email ?? "",
    phone: i.phone ?? "",
    location: i.location ?? "",
    links: {
      linkedin: i.links?.linkedin ?? "",
      github: i.links?.github ?? "",
      portfolio: i.links?.portfolio ?? "",
      scholar: i.links?.scholar ?? "",
      other: i.links?.other ?? "",
    },
    work_authorization: i.workAuthorization ?? "",
    requires_sponsorship: i.requiresSponsorship ?? null,
    willing_to_relocate: i.willingToRelocate ?? null,
    remote_preference: i.remotePreference ?? "",
    desired_compensation: i.desiredCompensation ?? "",
    earliest_start: i.earliestStart ?? "",
    notice_period: i.noticePeriod ?? "",
    pronouns: i.pronouns ?? "",
    eeo: {
      gender: i.eeo?.gender ?? "",
      race: i.eeo?.race ?? "",
      veteran: i.eeo?.veteran ?? "",
      disability: i.eeo?.disability ?? "",
      hispanic: i.eeo?.hispanic ?? "",
    },
  };
}
