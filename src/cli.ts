#!/usr/bin/env node

import { resolve } from "node:path";
import { parseOpenApiSpec } from "./openapi-parser.js";
import { generateTypescriptSdk } from "./generators/typescript.js";
import { generatePythonSdk } from "./generators/python.js";

const LANGUAGES = {
  typescript: generateTypescriptSdk,
  python: generatePythonSdk,
} as const;

type Language = keyof typeof LANGUAGES;

function printUsage(): void {
  console.log(`
  ingot — generate production-ready SDKs from OpenAPI specs.

  Usage:
    ingot generate --spec <path> --lang <language> --out <dir>

  Languages: ${Object.keys(LANGUAGES).join(", ")}

  Options:
    --spec    Path to OpenAPI 3.x spec (JSON or YAML)
    --lang    Target language
    --out     Output directory

  Examples:
    ingot generate --spec api.yaml --lang typescript --out ./sdk-ts
    ingot generate --spec api.json --lang python --out ./sdk-py
`);
}

function parseArgs(argv: string[]): {
  command: string;
  spec: string;
  lang: Language;
  out: string;
} | null {
  const args = argv.slice(2);
  const command = args[0];

  if (command !== "generate") return null;

  let spec = "";
  let lang = "";
  let out = "";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--spec":
        spec = args[++i] ?? "";
        break;
      case "--lang":
        lang = args[++i] ?? "";
        break;
      case "--out":
        out = args[++i] ?? "";
        break;
    }
  }

  if (!spec || !lang || !out) return null;
  if (!(lang in LANGUAGES)) {
    console.error(`Unknown language: ${lang}. Supported: ${Object.keys(LANGUAGES).join(", ")}`);
    process.exit(1);
  }

  return { command, spec, lang: lang as Language, out };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    printUsage();
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);
  const outputDir = resolve(parsed.out);

  console.log(`Parsing ${specPath}...`);
  const spec = await parseOpenApiSpec(specPath);
  console.log(`Parsed "${spec.name}" v${spec.version} — ${spec.groups.length} resource groups, ${spec.models.size} models`);

  const generator = LANGUAGES[parsed.lang];
  console.log(`Generating ${parsed.lang} SDK...`);
  await generator(spec, outputDir);
  console.log(`SDK written to ${outputDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
