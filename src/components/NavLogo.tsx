"use client";

import { motion } from "motion/react";

// Generated once via `figlet -f "Mini"` — small enough to sit in the navbar. The wordmark never
// changes, so this is a hardcoded string rather than a runtime figlet dependency.
const MINI_LOGO = String.raw`
  o  _  |_   _  _ |_  |  _  |_
  | (_) |_) _> (_ | | | (_) |_)
 _|
`.replace(/^\n|\n$/g, "");

// Animates in on every mount (including right after the OAuth redirect lands on an
// authenticated page) to read as the hero "arriving" in the navbar — an actual continuous
// shared-element transition isn't possible across the full-page redirect through GitHub's
// OAuth flow, so this is the closest honest approximation.
export function NavLogo() {
  return (
    <motion.pre
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="hidden whitespace-pre font-mono text-[5px] leading-[6px] text-pop sm:block"
      aria-label="jobschlob"
    >
      {MINI_LOGO}
    </motion.pre>
  );
}
