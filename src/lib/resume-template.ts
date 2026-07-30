// House-style LaTeX exemplars used as few-shot references for the LLM scaffold — it writes a
// complete new .tex document in this style rather than filling rigid placeholders, which
// survives varying content length better. Packages are deliberately limited to the set already
// warmed into the Tectonic cache at build time (see scripts/fixture.tex) so a real generation
// never needs a network fetch for an uncached package.
export const RESUME_EXEMPLAR = String.raw`\documentclass[11pt]{article}
\usepackage[margin=0.75in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{xcolor}
\usepackage{hyperref}
\titleformat{\section}{\bfseries\large}{}{0em}{}[\titlerule]
\titlespacing{\section}{0pt}{1em}{0.5em}
\begin{document}
\begin{center}
{\LARGE Jane Doe} \\
jane@example.com \textbullet{} (555) 123-4567 \textbullet{} \href{https://github.com/janedoe}{github.com/janedoe}
\end{center}

\section{Experience}
\textbf{Senior Backend Engineer}, Acme Corp \hfill 2021--Present
\begin{itemize}[leftmargin=*, itemsep=2pt]
  \item Led migration of the payments service from a monolith to Go microservices, cutting p99 latency 40\%.
  \item Designed the on-call runbook and alerting rules adopted across three teams.
\end{itemize}

\textbf{Software Engineer}, Beta Inc \hfill 2018--2021
\begin{itemize}[leftmargin=*, itemsep=2pt]
  \item Built the internal feature-flagging system used by every product team.
\end{itemize}

\section{Skills}
Go, Python, Kubernetes, PostgreSQL, distributed systems, on-call/incident response

\section{Education}
B.S. Computer Science, State University, 2018
\end{document}`;

export const COVER_LETTER_EXEMPLAR = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{hyperref}
\begin{document}
\noindent
Jane Doe \\
jane@example.com \textbullet{} (555) 123-4567

\vspace{1em}
\noindent
Hiring Team, Acme Corp

\vspace{1em}
\noindent
Dear Hiring Team,

I'm writing to apply for the Senior Backend Engineer role at Acme Corp. In my current role I led
the migration of our payments service to Go microservices, cutting p99 latency 40\% — the kind of
systems work I understand Acme's platform team is tackling at larger scale.

I'd welcome the chance to talk about how my background in distributed systems and on-call
ownership could contribute to your team.

\vspace{1em}
\noindent
Sincerely, \\
Jane Doe
\end{document}`;
