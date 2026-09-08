#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { lintYaml, type Finding } from "./linter.js";

function main(argv: string[]): number {
  const paths = argv.slice(2);
  if (paths.length === 0) {
    console.error("usage: yaml-config-linter <file.yaml> [file2.yaml ...]");
    return 2;
  }

  let hasErrors = false;

  for (const path of paths) {
    let source: string;
    try {
      source = readFileSync(path, "utf8");
    } catch (err) {
      console.error(`${path}: could not read file (${(err as Error).message})`);
      hasErrors = true;
      continue;
    }

    const findings = lintYaml(source);
    for (const finding of findings) {
      printFinding(path, finding);
      if (finding.severity === "error") {
        hasErrors = true;
      }
    }
  }

  return hasErrors ? 1 : 0;
}

function printFinding(path: string, finding: Finding): void {
  console.log(`${path}:${finding.line}: [${finding.severity}] ${finding.message} (${finding.rule})`);
}

process.exit(main(process.argv));
