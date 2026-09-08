/**
 * @file patch-genkit.js
 * @description Automatically patches @genkit-ai/google-genai converters to map tool responses to role 'user'.
 * Gemini 3.6 Flash / Google Generative Language API v1beta rejects role 'function' with HTTP 400.
 */

const fs = require("fs");
const path = require("path");

const filesToPatch = [
  path.join(__dirname, "node_modules/@genkit-ai/google-genai/lib/common/converters.js"),
  path.join(__dirname, "node_modules/@genkit-ai/google-genai/lib/common/converters.mjs"),
];

let patchedCount = 0;

for (const filePath of filesToPatch) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-genkit] File not found (skipping): ${filePath}`);
    continue;
  }

  try {
    const original = fs.readFileSync(filePath, "utf8");
    const targetPattern = /case\s+["']tool["']:\s*return\s+["']function["'];/g;
    const replacement = 'case "tool":\n      return "user";';

    if (targetPattern.test(original)) {
      const patched = original.replace(targetPattern, replacement);
      fs.writeFileSync(filePath, patched, "utf8");
      console.log(`[patch-genkit] Successfully patched: ${path.relative(__dirname, filePath)}`);
      patchedCount++;
    } else if (original.includes('case "tool":\n      return "user";') || original.includes('case "tool": return "user";')) {
      console.log(`[patch-genkit] Already patched: ${path.relative(__dirname, filePath)}`);
      patchedCount++;
    } else {
      console.warn(`[patch-genkit] Pattern not matched in: ${path.relative(__dirname, filePath)}`);
    }
  } catch (err) {
    console.error(`[patch-genkit] Failed to patch ${filePath}:`, err.message);
  }
}

console.log(`[patch-genkit] Finished. ${patchedCount} file(s) confirmed.`);
