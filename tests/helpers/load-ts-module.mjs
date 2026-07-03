import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cache = new Map();

export async function loadTsModule(path) {
  const filename = typeof path === "string" ? path : fileURLToPath(path);
  return import(await compileToDataUrl(resolve(filename)));
}

async function compileToDataUrl(filename) {
  const cached = cache.get(filename);
  if (cached) return cached;

  const pending = compile(filename);
  cache.set(filename, pending);
  return pending;
}

async function compile(filename) {
  const source = await readFile(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: filename,
  });

  const imports = [...outputText.matchAll(/(\bfrom\s+["'])([^"']+)(["'])|(\bimport\s+["'])([^"']+)(["'])/g)];
  let rewritten = outputText;
  for (const match of imports.reverse()) {
    const specifier = match[2] ?? match[5];
    const resolved = await resolveLocalSpecifier(specifier, filename);
    if (!resolved) continue;
    const dependencyUrl = await compileToDataUrl(resolved);
    const start = match.index + (match[1]?.length ?? match[4].length);
    const end = start + specifier.length;
    rewritten = `${rewritten.slice(0, start)}${dependencyUrl}${rewritten.slice(end)}`;
  }

  return `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
}

async function resolveLocalSpecifier(specifier, fromFile) {
  if (specifier.startsWith("@/")) {
    return firstExisting(resolve(projectRoot, "src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return firstExisting(resolve(dirname(fromFile), specifier));
  }
  return null;
}

async function firstExisting(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next extension.
    }
  }
  return null;
}
