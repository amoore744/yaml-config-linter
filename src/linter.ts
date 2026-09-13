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

// Matches "key:" or "key: value" once any leading whitespace and sequence
// dashes have already been stripped from the input. Deliberately does not
// try to handle flow mappings ({ a: 1 }) — see README for known limitations.
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

    const leading = /^(\s*)/.exec(line)?.[1] ?? "";
    let indent = leading.length;
    let content = line.slice(indent);
    let isSequenceItem = false;

    // Peel off one or more "- " sequence markers ("- - a: 1" for a list of
    // lists), tracking indent as the column where the mapping content
    // actually starts rather than where the dash sits.
    while (content === "-" || /^-\s/.test(content)) {
      isSequenceItem = true;
      while (stack.length && stack[stack.length - 1].indent > indent) {
        stack.pop();
      }
      let consumed = 1;
      while (content[consumed] === " ") {
        consumed++;
      }
      indent += consumed;
      content = content.slice(consumed);
    }

    if (isSequenceItem) {
      // Every "- " starts a new mapping, even one that lands at the same
      // indent as a sibling item's leftover frame, so discard it here
      // instead of reusing it.
      while (stack.length && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
    } else {
      // Pop back to the frame that owns this indent level.
      while (stack.length && stack[stack.length - 1].indent > indent) {
        stack.pop();
      }
    }

    if (content.trim() === "") {
      return;
    }

    const match = KEY_PATTERN.exec(content);
    if (!match) {
      return;
    }

    const key = match[2].trim();

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
