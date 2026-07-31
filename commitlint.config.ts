/**
 * @file commitlint.config.ts
 * @description Commitlint configuration for Conventional Commits validation
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Enforces Conventional Commits format per §1 AGENTS.md
 * - Types allowed: feat, fix, chore, security, style, docs, refactor, test, perf
 *
 * @dependencies
 * - @commitlint/config-conventional
 */

import type { UserConfig } from "@commitlint/types";

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "security", "style", "docs", "refactor", "test", "perf"],
    ],
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
  },
};

export default Configuration;
