#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { lintYaml, type Finding, type LintOptions } from "./linter.js";

type Format = "text" | "json";

interface JsonFinding extends Finding {
  file: string;
}

interface ParsedArgs {
  paths: string[];
  format: Format;
  configPath: string;
}

const DEFAULT_CONFIG_PATH = ".yaml-lint.json";

interface ConfigFile {
  maxLineLength?: number;
  rules?: Record<string, boolean>;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const paths: string[] = [];
  let format: Format = "text";
  let configPath = DEFAULT_CONFIG_PATH;

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
    } else if (arg === "--config") {
      configPath = argv[++i];
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
    } else {
      paths.push(arg);
    }
  }

  return { paths, format, configPath };
}

// Reads and validates the optional config file. Absence of the default
// config path is not an error — most runs will not have one — but a
// config passed explicitly with --config must exist and be valid.
function loadConfig(path: string, explicit: boolean): Partial<LintOptions> | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (!explicit && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    console.error(`${path}: could not read config file (${(err as Error).message})`);
    return null;
  }

  let parsed: ConfigFile;
  try {
    parsed = JSON.parse(raw) as ConfigFile;
  } catch (err) {
    console.error(`${path}: invalid JSON (${(err as Error).message})`);
    return null;
  }

  const options: Partial<LintOptions> = {};

  if (parsed.maxLineLength !== undefined) {
    if (typeof parsed.maxLineLength !== "number" || parsed.maxLineLength <= 0) {
      console.error(`${path}: "maxLineLength" must be a positive number`);
      return null;
    }
    options.maxLineLength = parsed.maxLineLength;
  }

  if (parsed.rules !== undefined) {
    const disabled = new Set<string>();
    for (const [rule, enabled] of Object.entries(parsed.rules)) {
      if (typeof enabled !== "boolean") {
        console.error(`${path}: rule "${rule}" must be set to true or false`);
        return null;
      }
      if (!enabled) {
        disabled.add(rule);
      }
    }
    options.disabledRules = disabled;
  }

  return options;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed) {
    return 2;
  }
  const { paths, format, configPath } = parsed;
  if (paths.length === 0) {
    console.error(
      "usage: yaml-config-linter [--format text|json] [--config path] <file.yaml> [file2.yaml ...]",
    );
    return 2;
  }

  const lintOptions = loadConfig(configPath, configPath !== DEFAULT_CONFIG_PATH);
  if (lintOptions === null) {
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

    const findings = lintYaml(source, lintOptions);
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
