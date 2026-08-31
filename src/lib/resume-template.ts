// The workshop fills these fixed LaTeX skeletons from structured content the LLM returns (see
// resume-scaffold.ts) instead of having the model emit LaTeX directly — left to write raw LaTeX
// it reliably produced valid-but-two-page, off-house-style documents. Layout, spacing, fonts and
// the package set all live here and never vary; the model only supplies text, which is then
// LaTeX-escaped here (so a stray & or % in someone's job title can't break the compile).
//
// Packages are limited to the set warmed into the Tectonic cache at build time
// (scripts/fixture.tex) so a generation never needs a network fetch.

export type ResumeEntry = {
  title: string;
  organization: string;
  location?: string;
  dates: string;
  bullets: string[]; // ordered strongest-first; the one-page fitter drops trailing ones
};

export type ResumeEducation = {
  degree: string;
  school: string;
  dates: string;
  details?: string;
};

export type ResumeData = {
  name: string;
  contact: string[]; // email / phone / links / city — rendered • separated, links auto-detected
  summary?: string;
  skills: string[];
  experience: ResumeEntry[];
  projects?: ResumeEntry[];
  education: ResumeEducation[];
};

export type CoverLetterData = {
  sender: string;
  senderContact: string[];
  recipient: string; // "Hiring Team, Acme Corp"
  greeting: string; // "Dear Hiring Team,"
  paragraphs: string[]; // body; the fitter drops the last if it overflows
  closing: string; // "Sincerely,"
};

const ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

function esc(s: string | undefined): string {
  return (s ?? "").replace(/[\\&%$#_{}~^]/g, (c) => ESCAPES[c]);
}

// A contact token that looks like a bare URL/handle ("github.com/x") becomes a clickable link;
// everything else (emails, phone numbers, "City, ST") renders as plain escaped text.
function renderContact(token: string): string {
  const t = (token ?? "").trim();
  const isUrl = !t.includes("@") && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t);
  if (!isUrl) return esc(t);
  const href = t.startsWith("http") ? t : `https://${t}`;
  return `\\href{${href.replace(/([#%\\])/g, "\\$1")}}{${esc(t.replace(/^https?:\/\//, ""))}}`;
}

function itemize(bullets: string[] | undefined): string {
  const items = (bullets ?? []).filter((b) => b && b.trim()).map((b) => `  \\item ${esc(b.trim())}`);
  return items.length ? `\\begin{itemize}\n${items.join("\n")}\n\\end{itemize}` : "";
}

function entryBlock(e: ResumeEntry): string {
  const head = `\\textbf{${esc(e.title)}}${e.organization ? `, ${esc(e.organization)}` : ""} \\hfill ${esc(e.dates)}`;
  const loc = e.location ? `\\\\\n\\textit{${esc(e.location)}}` : "";
  return `${head}${loc}\n${itemize(e.bullets)}`.trim();
}

const JOIN = "\n\n\\smallskip\n";

const RESUME_PREAMBLE = String.raw`\documentclass[10pt]{article}
\usepackage[margin=0.5in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{XCharter}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{xcolor}
\usepackage[hidelinks]{hyperref}
\definecolor{sectionrule}{gray}{0.6}
\titleformat{\section}{\bfseries\large}{}{0em}{}[{\color{sectionrule}\titlerule}]
\titlespacing{\section}{0pt}{0.9em}{0.4em}
\setlist[itemize]{leftmargin=1.3em, itemsep=1.5pt, topsep=2pt, parsep=0pt}
\setlength{\parindent}{0pt}
\pagenumbering{gobble}
`;

export function renderResume(d: ResumeData): string {
  const s: string[] = [];
  const contact = (d.contact ?? []).map(renderContact).join(" \\textbullet{} ");
  s.push(`\\begin{center}\n{\\LARGE \\textbf{${esc(d.name)}}}${contact ? `\\\\[2pt]\n${contact}` : ""}\n\\end{center}`);
  if (d.summary?.trim()) s.push(esc(d.summary.trim()));
  if (d.skills?.length) s.push(`\\section*{Skills}\n${d.skills.map(esc).join(", ")}`);
  if (d.experience?.length) s.push(`\\section*{Experience}\n${d.experience.map(entryBlock).join(JOIN)}`);
  if (d.projects?.length) s.push(`\\section*{Projects}\n${d.projects.map(entryBlock).join(JOIN)}`);
  if (d.education?.length)
    s.push(
      `\\section*{Education}\n${d.education
        .map(
          (e) =>
            `\\textbf{${esc(e.degree)}}, ${esc(e.school)} \\hfill ${esc(e.dates)}${
              e.details ? `\\\\\n\\textit{${esc(e.details)}}` : ""
            }`,
        )
        .join(JOIN)}`,
    );
  return `${RESUME_PREAMBLE}\\begin{document}\n${s.join("\n\n")}\n\\end{document}\n`;
}

const COVER_PREAMBLE = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{XCharter}
\usepackage[hidelinks]{hyperref}
\setlength{\parindent}{0pt}
\setlength{\parskip}{1em}
\pagenumbering{gobble}
`;

export function renderCoverLetter(d: CoverLetterData): string {
  const contact = (d.senderContact ?? []).map(renderContact).join(" \\textbullet{} ");
  const body = (d.paragraphs ?? [])
    .filter((p) => p && p.trim())
    .map((p) => esc(p.trim()))
    .join("\n\n");
  return `${COVER_PREAMBLE}\\begin{document}
${esc(d.sender)}${contact ? `\\\\\n${contact}` : ""}

${esc(d.recipient)}

${esc(d.greeting)}

${body}

${esc(d.closing)}\\\\
${esc(d.sender)}
\\end{document}
`;
}

// One-page fitter hooks: each removes the single lowest-priority piece and returns its text, or
// null when nothing more can be cut. Both mutate the passed object.
export function trimResume(d: ResumeData): string | null {
  for (const pool of [d.projects ?? [], d.experience ?? []]) {
    const target = [...pool]
      .filter((e) => (e.bullets?.length ?? 0) > 1)
      .sort((a, b) => b.bullets.length - a.bullets.length)[0];
    if (target) return target.bullets.pop() ?? null;
  }
  return null;
}

export function trimCoverLetter(d: CoverLetterData): string | null {
  return (d.paragraphs?.length ?? 0) > 2 ? d.paragraphs.pop() ?? null : null;
}
