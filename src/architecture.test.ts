// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

/** The webview's sources by path from `src/`, tests and their helpers left out as they reach across layers on purpose. */
const sources = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      [
        "./**/*.ts",
        "./**/*.svelte",
        "!./**/*.test.ts",
        "!./**/test-*.ts",
        "!./**/*.d.ts",
      ],
      { query: "?raw", import: "default", eager: true },
    ),
  ).map(([path, source]) => [path.slice(2), source]),
);

/** A module one source imports, and whether only its types are taken. */
interface ImportedModule {
  path: string;
  isTypeOnly: boolean;
}

/** The layers of `docs/architecture.md` § 4.2, by what a path from `src/` starts with. */
type Layer =
  | "editor"
  | "editor entry"
  | "backend"
  | "ui"
  | "page.ts"
  | "Svelte Component"
  | "i18n"
  | "other";

function layer(path: string): Layer {
  if (path === "editor/index.ts") return "editor entry";
  if (path.startsWith("editor/")) return "editor";
  if (path.startsWith("backend/")) return "backend";
  if (path.startsWith("ui/")) return "ui";
  if (path === "page.ts") return "page.ts";
  if (path === "Page.svelte" || path.startsWith("components/"))
    return "Svelte Component";
  if (path === "i18n.ts" || path.startsWith("locales/")) return "i18n";
  return "other";
}

/** What a layer may import: whole modules of some layers, and only the types of others. */
interface LayerRule {
  modules: Layer[];
  types?: Layer[];
}

/**
 * Each layer's rule, as § 4.2 lists them; a layer missing here, as `main.ts` and the assembly
 * are, may import any.
 */
const RULE_BY_LAYER: Partial<Record<Layer, LayerRule>> = {
  editor: { modules: ["editor", "editor entry"] },
  "editor entry": { modules: ["editor"] },
  backend: { modules: ["backend", "editor entry"] },
  ui: { modules: ["ui", "i18n"], types: ["editor entry", "editor", "backend"] },
  "page.ts": {
    modules: ["Svelte Component", "ui", "i18n"],
    types: ["editor entry", "backend"],
  },
  "Svelte Component": {
    modules: ["Svelte Component", "ui", "backend", "editor entry", "i18n"],
  },
};

/** The modules `source`, found at `path`, imports by a relative path, resolved to paths from `src/`. */
function importedModules(path: string, source: string): ImportedModule[] {
  const directory = path.split("/").slice(0, -1);
  return [
    ...source.matchAll(
      /^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+["'](\.{1,2}\/[^"']+)["']/gm,
    ),
  ].map(([, , typeKeyword, names, specifier]) => {
    const parts = [...directory];
    for (const part of specifier.split("/")) {
      if (part === "..") parts.pop();
      else if (part !== ".") parts.push(part);
    }
    return {
      path: modulePath(parts.join("/")),
      isTypeOnly: typeKeyword !== undefined || isEveryNameType(names),
    };
  });
}

/** Whether every name in braces such as `{ type A, type B }` is marked a type. */
function isEveryNameType(names: string): boolean {
  if (!/^\{[^}]*\}$/.test(names.trim())) return false;
  return names
    .replace(/[{}]/g, "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .every((name) => name.startsWith("type "));
}

/** The source file `path` names, as `../editor` names `editor/index.ts`. */
function modulePath(path: string): string {
  if (path in sources || /\.(svelte|json)$/.test(path)) return path;
  if (`${path}.ts` in sources) return `${path}.ts`;
  if (`${path}/index.ts` in sources) return `${path}/index.ts`;
  return path;
}

/** Each import breaking § 4.2, as `from -> to`. */
function brokenImports(): string[] {
  return Object.entries(sources).flatMap(([path, source]) => {
    const rule = RULE_BY_LAYER[layer(path)];
    if (!rule) return [];
    return importedModules(path, source)
      .filter(({ path: imported, isTypeOnly }) => {
        const target = layer(imported);
        const isAllowed =
          rule.modules.includes(target) ||
          (isTypeOnly && (rule.types ?? []).includes(target));
        return !isAllowed;
      })
      .map(({ path: imported }) => `${path} -> ${imported}`);
  });
}

describe("the webview's layers", () => {
  it("reads every layer the rules name", () => {
    const layers = new Set(Object.keys(sources).map(layer));

    expect([...layers]).toEqual(
      expect.arrayContaining(Object.keys(RULE_BY_LAYER)),
    );
  });

  it("finds the relative imports a source makes, over several lines too", () => {
    const modules = importedModules(
      "controllers/x-controller.ts",
      'import { mount } from "svelte";\nimport {\n  type A,\n  type B,\n} from "../editor";\nimport { c } from "./y";',
    );

    expect(modules).toEqual([
      { path: "editor/index.ts", isTypeOnly: true },
      { path: "controllers/y", isTypeOnly: false },
    ]);
  });

  it("keeps every import pointing where docs/architecture.md § 4.2 allows", () => {
    expect(brokenImports()).toEqual([]);
  });

  it("hands the editing commands to the session alone, from the assembly", () => {
    const callers = Object.entries(sources)
      .filter(([, source]) => /\beditingPort\b/.test(source))
      .map(([path]) => path);

    expect(callers).toEqual(["assembly.ts", "backend/editing.ts"]);
  });
});
