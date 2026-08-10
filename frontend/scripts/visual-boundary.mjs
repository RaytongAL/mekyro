import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const allowedPatterns = [
  /^docs\/superpowers\/(plans|specs)\//,
  /^frontend\/package\.json$/,
  /^frontend\/scripts\/visual-boundary(?:\.test)?\.mjs$/,
  /^frontend\/src\/globals\.css$/,
  /^frontend\/src\/components\/backend-ui\//,
  /^frontend\/src\/components\/(border-glow\.tsx|official-border-glow\.(tsx|css))$/,
  /^frontend\/src\/components\/(official-site|sms-login-form)\.tsx$/,
  /^frontend\/src\/components\/ui\/combobox\.tsx$/,
  /^frontend\/src\/components\/shadcn-studio\/combobox\/combobox-01\.tsx$/,
  /^frontend\/src\/components\/ops-shell\/(?!workspace-context\.tsx$)/,
  /^frontend\/src\/components\/supplier-shell\//,
  /^frontend\/src\/i18n\/(zh-CN|en-US)\.json$/,
];

export function findForbiddenVisualFiles(files) {
  return files
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !allowedPatterns.some((pattern) => pattern.test(file)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.VISUAL_BOUNDARY_BASE || "origin/main";
  const output = execFileSync("git", ["diff", "--name-only", base, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const forbidden = findForbiddenVisualFiles(output.split("\n"));

  if (forbidden.length > 0) {
    console.error("Visual-only boundary violation:");
    for (const file of forbidden) console.error(`- ${file}`);
    process.exitCode = 1;
  } else {
    console.log("Visual-only boundary verified.");
  }
}
