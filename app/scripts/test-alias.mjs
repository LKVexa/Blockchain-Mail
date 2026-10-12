import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function withExtension(file) {
  for (const candidate of [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const file = withExtension(join(root, "src", specifier.slice(2)));
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".")) {
      const parent = context.parentURL ? fileURLToPath(new URL(".", context.parentURL)) : root;
      const file = withExtension(join(parent, specifier));
      if (file) return nextResolve(pathToFileURL(file).href, context);
    }
    throw error;
  }
}
