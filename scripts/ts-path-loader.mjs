import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function existingModuleUrl(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js")
  ];
  const match = candidates.find((candidate) => existsSync(candidate));

  return match ? pathToFileURL(match).href : null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2);
    const url = existingModuleUrl(path.join(projectRoot, relativePath));

    if (url) {
      return {
        url,
        shortCircuit: true
      };
    }
  }

  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parentPath = fileURLToPath(context.parentURL);
    const url = existingModuleUrl(path.resolve(path.dirname(parentPath), specifier));

    if (url) {
      return {
        url,
        shortCircuit: true
      };
    }
  }

  return nextResolve(specifier, context);
}
