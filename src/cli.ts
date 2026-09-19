#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { lintYaml, type Finding } from "./linter.js";

type Format = "text" | "json";

interface JsonFinding extends Finding {
  file: string;
}

interface ParsedArgs {
  paths: string[];
  format: Format;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const paths: string[] = [];
  let format: Format = "text";

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format") {
      const value = argv[++i];
      if (value !== "text" && value !== "json") {
        console.error(`unknown format "${value}"; expected "text" or "json"`);
        return null;
      }
      format = value;
    } else if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (value !== "text" && value !== "json") {
        console.error(`unknown format "${value}"; expected "text" or "json"`);
        return null;
      }
      format = value;
    } else {
      paths.push(arg);
    }
  }

  return { paths, format };
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed) {
    return 2;
  }
  const { paths, format } = parsed;
  if (paths.length === 0) {
    console.error("usage: yaml-config-linter [--format text|json] <file.yaml> [file2.yaml ...]");
    return 2;
  }

  let hasErrors = false;
  const jsonFindings: JsonFinding[] = [];

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
      if (format === "json") {
        jsonFindings.push({ file: path, ...finding });
      } else {
        printFinding(path, finding);
      }
      if (finding.severity === "error") {
        hasErrors = true;
      }
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(jsonFindings, null, 2));
  }

  return hasErrors ? 1 : 0;
}

function printFinding(path: string, finding: Finding): void {
  console.log(`${path}:${finding.line}: [${finding.severity}] ${finding.message} (${finding.rule})`);
}

process.exit(main(process.argv));
