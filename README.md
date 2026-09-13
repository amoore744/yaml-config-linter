# yaml-config-linter

A small linter for YAML config files. It reads a file, walks it line by
line, and prints findings with line numbers — the kind of problems that
are easy to miss in a diff review but cause real outages: a tab that
snuck into indentation, a key defined twice in the same mapping so the
second value silently wins, trailing whitespace, lines that run too long.

It has no dependencies. It does not parse YAML into a document tree; it
does enough line-oriented analysis to catch the mistakes above without
pulling in a full parser.

## Why

Most YAML problems that break a deploy are not "invalid YAML" — they're
valid YAML that says something other than what the author meant. A
duplicate key is legal YAML; the parser just keeps the last one and
never tells you the first one existed. A tab character mixed into
spaces is legal in some places and a parse error in others, depending
on exactly where it lands. Those are the cases this tool looks for.

## Usage

Build once:

```sh
npm install
npm run build
```

Then run it against one or more files:

```sh
node dist/cli.js config.yaml
```

Given this file:

```yaml
service:
  name: payments
  name: payments-api
  port: 8080
	timeout: 30
```

it reports:

```
config.yaml:3: [error] duplicate key "name" at this indentation level (duplicate-key)
config.yaml:5: [error] tab used for indentation; YAML indentation must use spaces (no-tabs)
```

Exit code is `1` if any finding is an error, `0` otherwise, so it can be
used as a CI gate.

## Rules

| rule | severity | what it catches |
| --- | --- | --- |
| `no-tabs` | error | a tab character in a line's leading whitespace |
| `duplicate-key` | error | the same key appearing twice in one mapping |
| `trailing-whitespace` | warning | spaces or tabs at the end of a line |
| `line-length` | warning | a line longer than 120 characters |
| `odd-indentation` | warning | a nested block indented by an odd number of spaces relative to its parent |

## Known limitations

This is a line-based checker, not a YAML parser, so it currently does
not understand:

- flow-style mappings (`{ a: 1, b: 2 }`)
- multi-line scalars (`|` and `>` blocks) — content inside them is
  checked for tabs/whitespace/length like any other line, which can
  produce noise if a block scalar legitimately contains a tab

Keys inside sequence items (`- name: foo`) are handled: each `- `
starts a fresh mapping, so a `name` key repeated across list items is
not flagged as a duplicate, but a real duplicate within one item still
is.

## License

MIT, see [LICENSE](LICENSE).
