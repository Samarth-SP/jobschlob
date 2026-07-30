"use client";

import { motion } from "motion/react";
import { SCENE_ASCII } from "@/lib/scene-ascii";

export function SceneArt() {
  return (
    <motion.pre
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
      className="overflow-x-auto whitespace-pre font-mono text-[clamp(0.25rem,0.8vw,0.5rem)] leading-none text-foreground-muted"
      aria-hidden
    >
      {SCENE_ASCII}
    </motion.pre>
  );
}
