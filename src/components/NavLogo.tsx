"use client";

import { motion } from "motion/react";
import { ASCII_LOGO } from "@/lib/ascii-logo";

// The same art as the landing-page hero, just smaller — animates in on every mount (including
// right after the OAuth redirect lands on an authenticated page) to read as the hero "arriving"
// in the navbar. An actual continuous shared-element transition isn't possible across the
// full-page redirect through GitHub's OAuth flow, so this is the closest honest approximation.
export function NavLogo() {
  return (
    <motion.pre
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="hidden whitespace-pre font-mono text-[3px] leading-[3.5px] text-pop sm:block"
      aria-label="jobschlob"
    >
      {ASCII_LOGO}
    </motion.pre>
  );
}
