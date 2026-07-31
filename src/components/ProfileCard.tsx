import Link from "next/link";

// Our profiles table only has free-text `background` + jsonb filters — no structured
// name/school/GPA fields — so unlike the Figma reference this shows what we actually have
// (email as identity, an excerpt of the background corpus) rather than inventing schema.
export function ProfileCard({ email, background }: { email: string; background: string }) {
  const initials = email.slice(0, 2).toUpperCase();
  const trimmed = background.trim();
  const excerpt = trimmed
    ? trimmed.length > 220
      ? `${trimmed.slice(0, 220).trim()}…`
      : trimmed
    : "No background set yet — add one on your profile page to get compatibility scores.";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent/15 bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-sm font-semibold text-accent">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{email}</p>
          <Link href="/profile" className="text-xs text-foreground-muted hover:text-accent">
            Edit profile →
          </Link>
        </div>
      </div>
      <div className="border-t border-accent/10 pt-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground-muted/70">Background</p>
        <p className="text-xs leading-relaxed text-foreground-muted">{excerpt}</p>
      </div>
    </div>
  );
}
