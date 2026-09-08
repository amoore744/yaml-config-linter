export type Severity = "error" | "warning";

export interface Finding {
  line: number;
  rule: string;
  severity: Severity;
  message: string;
}

export interface LintOptions {
  maxLineLength: number;
}

const DEFAULT_OPTIONS: LintOptions = {
  maxLineLength: 120,
};

// Matches "key:" or "key: value" at the start of a line, ignoring leading
// whitespace. Deliberately does not try to handle flow mappings ({ a: 1 })
// or sequence-item keys ("- a: 1") yet — see README for known limitations.
const KEY_PATTERN = /^(\s*)([^\s#:][^:]*?):(\s|$)/;

interface Frame {
  indent: number;
  keys: Set<string>;
}

export function lintYaml(source: string, options: Partial<LintOptions> = {}): Finding[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const findings: Finding[] = [];
  const lines = source.split(/\r\n|\n/);
  const stack: Frame[] = [];

  lines.forEach((line, index) => {
    const lineNo = index + 1;

    // A document separator starts a fresh mapping scope.
    if (line.trim() === "---") {
      stack.length = 0;
      return;
    }

    checkTabs(line, lineNo, findings);
    checkTrailingWhitespace(line, lineNo, findings);
    checkLineLength(line, lineNo, opts.maxLineLength, findings);

    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      return;
    }

    const match = KEY_PATTERN.exec(line);
    if (!match) {
      return;
    }

    const indent = match[1].length;
    const key = match[2].trim();

    // Pop back to the frame that owns this indent level.
    while (stack.length && stack[stack.length - 1].indent > indent) {
      stack.pop();
    }

    let frame = stack[stack.length - 1];
    let isNewFrame = false;
    if (!frame || frame.indent < indent) {
      frame = { indent, keys: new Set() };
      stack.push(frame);
      isNewFrame = true;
    }

    if (frame.keys.has(key)) {
      findings.push({
        line: lineNo,
        rule: "duplicate-key",
        severity: "error",
        message: `duplicate key "${key}" at this indentation level`,
      });
    } else {
      frame.keys.add(key);
    }

    if (isNewFrame) {
      checkIndentStep(stack, lineNo, findings);
    }
  });

  return findings.sort((a, b) => a.line - b.line);
}

function checkTabs(line: string, lineNo: number, findings: Finding[]): void {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  if (leading.includes("\t")) {
    findings.push({
      line: lineNo,
      rule: "no-tabs",
      severity: "error",
      message: "tab used for indentation; YAML indentation must use spaces",
    });
  }
}

function checkTrailingWhitespace(line: string, lineNo: number, findings: Finding[]): void {
  if (/[ \t]+$/.test(line)) {
    findings.push({
      line: lineNo,
      rule: "trailing-whitespace",
      severity: "warning",
      message: "trailing whitespace",
    });
  }
}

function checkLineLength(line: string, lineNo: number, max: number, findings: Finding[]): void {
  if (line.length > max) {
    findings.push({
      line: lineNo,
      rule: "line-length",
      severity: "warning",
      message: `line exceeds ${max} characters (${line.length})`,
    });
  }
}

function checkIndentStep(stack: Frame[], lineNo: number, findings: Finding[]): void {
  if (stack.length < 2) return;
  const top = stack[stack.length - 1];
  const parent = stack[stack.length - 2];
  const step = top.indent - parent.indent;
  if (step % 2 !== 0) {
    findings.push({
      line: lineNo,
      rule: "odd-indentation",
      severity: "warning",
      message: `indentation increases by ${step} spaces; expected an even step`,
    });
  }
}
