"use client";

import { useActionState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ApplyIdentity } from "@/lib/apply-identity";

export type IdentityResult = { saved: true } | null;

function TriBool({ name, value }: { name: string; value: boolean | null | undefined }) {
  return (
    <select
      name={name}
      defaultValue={value === true ? "yes" : value === false ? "no" : ""}
      className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
    >
      <option value="">Unspecified</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function Field({ label, name, defaultValue, placeholder }: { label: string; name: string; defaultValue?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-foreground-muted">
      <span>{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-muted/60"
      />
    </label>
  );
}

// Discrete contact/eligibility facts for the local auto-apply worker's deterministic field
// mapping (boof/apply/mapping.py's build_facts) — distinct from the free-text background on this
// same page, which is for scoring/tailoring prose, not form fields a filler can address directly.
export function IdentityForm({
  action,
  initial,
}: {
  action: (prev: IdentityResult, formData: FormData) => Promise<IdentityResult>;
  initial: ApplyIdentity;
}) {
  const [result, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded border border-accent/20 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Application identity</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Used by the local auto-apply worker to fill in the fields every application form asks for. Never guessed —
          if a field here is blank, the worker leaves that form field for you instead.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" name="fullName" defaultValue={initial.fullName} />
        <Field label="Email" name="email" defaultValue={initial.email} />
        <Field label="Phone" name="phone" defaultValue={initial.phone} />
        <Field label="Location" name="location" defaultValue={initial.location} placeholder="City, State, Country" />
        <Field label="LinkedIn" name="linkedin" defaultValue={initial.links?.linkedin} />
        <Field label="GitHub" name="github" defaultValue={initial.links?.github} />
        <Field label="Portfolio / website" name="portfolio" defaultValue={initial.links?.portfolio} />
        <Field label="Pronouns (optional)" name="pronouns" defaultValue={initial.pronouns} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Work authorization"
          name="workAuthorization"
          defaultValue={initial.workAuthorization}
          placeholder="e.g. US citizen / Green card / H-1B / F-1 OPT"
        />
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>Will you require sponsorship?</span>
          <TriBool name="requiresSponsorship" value={initial.requiresSponsorship} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>Willing to relocate?</span>
          <TriBool name="willingToRelocate" value={initial.willingToRelocate} />
        </label>
        <Field label="Remote preference" name="remotePreference" defaultValue={initial.remotePreference} placeholder="remote / hybrid / onsite" />
        <Field label="Desired compensation" name="desiredCompensation" defaultValue={initial.desiredCompensation} placeholder="leave blank to fill in yourself" />
        <Field label="Earliest start date" name="earliestStart" defaultValue={initial.earliestStart} />
        <Field label="Notice period" name="noticePeriod" defaultValue={initial.noticePeriod} />
      </div>

      <details className="text-xs text-foreground-muted">
        <summary className="cursor-pointer select-none text-foreground">Voluntary self-identification (optional)</summary>
        <p className="mt-2 mb-2">Blank = decline to answer, which is what these questions default to anyway.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gender" name="eeoGender" defaultValue={initial.eeo?.gender} />
          <Field label="Race / ethnicity" name="eeoRace" defaultValue={initial.eeo?.race} />
          <Field label="Veteran status" name="eeoVeteran" defaultValue={initial.eeo?.veteran} />
          <Field label="Disability status" name="eeoDisability" defaultValue={initial.eeo?.disability} />
          <Field label="Hispanic/Latino" name="eeoHispanic" defaultValue={initial.eeo?.hispanic} />
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-accent px-4 py-2 text-sm text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <AnimatePresence mode="wait">
          {result && (
            <motion.span
              key={`identity-saved`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-accent"
            >
              Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
