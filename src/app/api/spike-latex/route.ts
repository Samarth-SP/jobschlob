import { auth } from "@/lib/auth";
import { compileLatex } from "@/lib/latex";

export const runtime = "nodejs";

const SPIKE_TEX = String.raw`
\documentclass{article}
\begin{document}
Tectonic spike: it works on Vercel.
\end{document}
`;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return new Response("unauthorized", { status: 401 });

  const pdf = await compileLatex(SPIKE_TEX);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
}
