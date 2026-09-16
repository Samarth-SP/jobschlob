// The workshop fills these fixed LaTeX skeletons from structured content the LLM returns (see
// resume-scaffold.ts) instead of having the model write LaTeX directly — left to write raw LaTeX
// it reliably produced valid-but-two-page, off-house-style documents. Layout, spacing, fonts and
// the package set all live here and never vary; the model only supplies text, which is then
// LaTeX-escaped here (so a stray & or % in a job title can't break the compile).
//
// RESUME_PREAMBLE is Jake Gutierrez's widely-used resume template (MIT, based on
// github.com/sb2nov/resume) reproduced verbatim except: \usepackage{charter} → {XCharter} (the
// legacy charter package silently substitutes fonts under Tectonic's XeTeX engine) and the two
// \input{glyphtounicode} / \pdfgentounicode lines dropped (pdfTeX-only primitives Tectonic can't
// run — lib/latex.ts strips them anyway, but keeping them out avoids a spurious "adjusted for
// compatibility" warning on every generation). Every package it needs is warmed into the
// Tectonic cache at build time (scripts/fixture.tex).

export type ResumeEntry = {
  organization: string;
  location: string;
  role: string; // job title — or the degree line, for education
  dates: string;
  bullets: string[]; // ordered strongest-first; the one-page fitter drops trailing ones
};

export type ResumeProject = {
  name: string;
  dates: string;
  bullets: string[];
};

export type ResumeSkillGroup = {
  category: string; // "Languages", "ML / AI", …
  items: string[];
};

export type ResumeData = {
  name: string;
  contact: string[]; // rendered " | " separated; URL-ish tokens auto-linked
  education: ResumeEntry[];
  experience: ResumeEntry[];
  projects: ResumeProject[];
  leadership: ResumeEntry[]; // activities/leadership roles — optional, used by e.g. the consulting archetype
  skills: ResumeSkillGroup[];
};

// Which sections a resume has and in what order — archetype-driven (see resume-archetypes.ts).
// Defaults below match this file's original, hardcoded education→experience→projects→skills order.
export type SectionKey = "education" | "experience" | "projects" | "leadership" | "skills";
export const DEFAULT_SECTION_ORDER: SectionKey[] = ["education", "experience", "projects", "skills"];
export const DEFAULT_TRIM_PRIORITY: SectionKey[] = ["projects", "experience"];

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

// A contact token that looks like a bare URL/handle ("github.com/x") becomes a clickable link
// (visually identical under \urlstyle{same} + hidelinks); everything else — emails, phone
// numbers, "City, ST" — renders as plain escaped text.
function renderContact(token: string): string {
  const t = (token ?? "").trim();
  const isUrl = !t.includes("@") && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t);
  if (!isUrl) return esc(t);
  const href = t.startsWith("http") ? t : `https://${t}`;
  return `\\href{${href.replace(/([#%\\])/g, "\\$1")}}{${esc(t.replace(/^https?:\/\//, ""))}}`;
}

function itemList(bullets: string[] | undefined): string {
  const items = (bullets ?? []).filter((b) => b && b.trim()).map((b) => `      \\resumeItem{${esc(b.trim())}}`);
  return items.length ? `    \\resumeItemListStart\n${items.join("\n")}\n    \\resumeItemListEnd` : "";
}

function entryBlock(e: ResumeEntry): string {
  return `  \\resumeSubheading\n    {${esc(e.organization)}}{${esc(e.location)}}\n    {${esc(e.role)}}{${esc(e.dates)}}\n${itemList(e.bullets)}`;
}

function projectBlock(p: ResumeProject): string {
  return `  \\resumeProjectHeading\n    {\\textbf{${esc(p.name)}}}{${esc(p.dates)}}\n${itemList(p.bullets)}`;
}

function listSection(title: string, blocks: string[]): string {
  return `\\section{${title}}\n  \\resumeSubHeadingListStart\n${blocks.join("\n\n")}\n  \\resumeSubHeadingListEnd`;
}

function skillsSection(groups: ResumeSkillGroup[]): string {
  const lines = groups
    .filter((g) => g.items?.length)
    .map((g) => `     \\textbf{${esc(g.category)}}: ${esc(g.items.join(", "))}`)
    .join(" \\\\\n");
  return `\\section{Technical Skills}\n \\begin{itemize}[leftmargin=0.15in, label={}]\n  \\small{\\item{\n${lines}\n  }}\n \\end{itemize}`;
}

const RESUME_PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{XCharter}
\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}
\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}
\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}
\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}
\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
`;

// One renderer per possible section, each returning null when that section has nothing to show
// — looked up by key so an archetype's sectionOrder can freely reorder/omit/include them.
function sectionRenderers(d: ResumeData): Record<SectionKey, () => string | null> {
  return {
    education: () => (d.education?.length ? listSection("Education", d.education.map(entryBlock)) : null),
    experience: () => (d.experience?.length ? listSection("Experience", d.experience.map(entryBlock)) : null),
    projects: () => (d.projects?.length ? listSection("Projects", d.projects.map(projectBlock)) : null),
    leadership: () => (d.leadership?.length ? listSection("Leadership & Activities", d.leadership.map(entryBlock)) : null),
    skills: () => (d.skills?.length ? skillsSection(d.skills) : null),
  };
}

export function renderResume(d: ResumeData, sectionOrder: SectionKey[] = DEFAULT_SECTION_ORDER): string {
  const contact = (d.contact ?? []).map(renderContact).join(" \\textbar{} ");
  const parts: string[] = [
    `\\begin{center}\n  \\textbf{\\Huge \\scshape ${esc(d.name)}} \\\\ \\vspace{1pt}\n  \\small ${contact}\n\\end{center}`,
  ];
  const renderers = sectionRenderers(d);
  for (const key of sectionOrder) {
    const rendered = renderers[key]();
    if (rendered) parts.push(rendered);
  }
  return `${RESUME_PREAMBLE}\n\\begin{document}\n\n${parts.join("\n\n")}\n\n\\end{document}\n`;
}

const COVER_PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[empty]{fullpage}
\usepackage[hidelinks]{hyperref}
\usepackage{XCharter}
\addtolength{\oddsidemargin}{-0.25in}
\addtolength{\evensidemargin}{-0.25in}
\addtolength{\textwidth}{0.5in}
\urlstyle{same}
\raggedright
\setlength{\parindent}{0pt}
\setlength{\parskip}{1em}
\pagenumbering{gobble}
`;

export function renderCoverLetter(d: CoverLetterData): string {
  const contact = (d.senderContact ?? []).map(renderContact).join(" \\textbar{} ");
  const body = (d.paragraphs ?? [])
    .filter((p) => p && p.trim())
    .map((p) => esc(p.trim()))
    .join("\n\n");
  return `${COVER_PREAMBLE}\n\\begin{document}
\\textbf{\\large ${esc(d.sender)}}${contact ? `\\\\\n${contact}` : ""}

${esc(d.recipient)}

${esc(d.greeting)}

${body}

${esc(d.closing)}\\\\
${esc(d.sender)}
\\end{document}
`;
}

// One-page fitter hooks: each removes the single lowest-priority piece and returns its text, or
// null when nothing more can be cut. Both mutate the passed object. Education and skills are
// never trimmed — trimPriority only ever names bullet-bearing sections.
export function trimResume(d: ResumeData, trimPriority: SectionKey[] = DEFAULT_TRIM_PRIORITY): string | null {
  const pools: Partial<Record<SectionKey, { bullets: string[] }[]>> = {
    projects: d.projects ?? [],
    experience: d.experience ?? [],
    leadership: d.leadership ?? [],
  };
  for (const key of trimPriority) {
    const pool = pools[key];
    if (!pool) continue;
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
