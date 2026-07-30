"use client";

import { motion } from "motion/react";

// Generated once via `figlet -f "ANSI Shadow"` — the wordmark never changes, so this is a
// hardcoded string rather than a runtime figlet dependency.
const ASCII_LOGO = String.raw`
     ██╗ ██████╗ ██████╗ ███████╗ ██████╗██╗  ██╗██╗      ██████╗ ██████╗
     ██║██╔═══██╗██╔══██╗██╔════╝██╔════╝██║  ██║██║     ██╔═══██╗██╔══██╗
     ██║██║   ██║██████╔╝███████╗██║     ███████║██║     ██║   ██║██████╔╝
██   ██║██║   ██║██╔══██╗╚════██║██║     ██╔══██║██║     ██║   ██║██╔══██╗
╚█████╔╝╚██████╔╝██████╔╝███████║╚██████╗██║  ██║███████╗╚██████╔╝██████╔╝
 ╚════╝  ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝
`.replace(/^\n|\n$/g, "");

export function AsciiHero() {
  return (
    <motion.pre
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="overflow-x-auto whitespace-pre font-mono text-[clamp(0.55rem,1.6vw,1rem)] leading-tight text-pop"
      aria-label="jobschlob"
    >
      {ASCII_LOGO}
    </motion.pre>
  );
}
