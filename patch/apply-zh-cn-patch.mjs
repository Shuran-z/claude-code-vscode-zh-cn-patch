#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultTranslationPath = path.join(scriptDir, "translations.zh-CN.json");
const extensionPrefix = "anthropic.claude-code-";

function usage() {
  return `
Usage:
  node patch/apply-zh-cn-patch.mjs [--extension-dir <dir>] [--translations <file>]

Options:
  --extension-dir <dir>  Claude Code VS Code extension directory.
  --translations <file>  Translation table JSON. Defaults to patch/translations.zh-CN.json.
  --dry-run              Report planned changes without writing files.
  --no-backup            Do not create *.zh-cn-patch-backup files.
  --allow-missing        Do not fail when some replacement strings are not found.
  --force                Apply even when the installed extension version differs.
  --help                 Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    extensionDir: null,
    translations: defaultTranslationPath,
    dryRun: false,
    backup: true,
    allowMissing: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage().trim());
      process.exit(0);
    }
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-backup") args.backup = false;
    else if (arg === "--allow-missing") args.allowMissing = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--extension-dir") args.extensionDir = argv[++i];
    else if (arg === "--translations") args.translations = argv[++i];
    else if (!args.extensionDir) args.extensionDir = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function expandHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function versionFromDirName(name) {
  const match = name.match(/claude-code-(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return match.slice(1).map(Number);
}

function compareVersionTuple(a, b) {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findExtensionDir() {
  const roots = [
    path.join(os.homedir(), ".vscode-server", "extensions"),
    path.join(os.homedir(), ".vscode", "extensions"),
    path.join(os.homedir(), ".cursor-server", "extensions"),
    path.join(os.homedir(), ".cursor", "extensions"),
  ];
  const candidates = [];

  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(extensionPrefix)) {
        candidates.push(path.join(root, entry.name));
      }
    }
  }

  candidates.sort((a, b) => compareVersionTuple(versionFromDirName(path.basename(b)), versionFromDirName(path.basename(a))));
  return candidates[0] ?? null;
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count++;
    index += needle.length;
  }
  return count;
}

async function backupFile(filePath, options) {
  if (!options.backup || options.dryRun) return;
  const backupPath = `${filePath}.zh-cn-patch-backup`;
  if (!(await pathExists(backupPath))) {
    await fs.copyFile(filePath, backupPath);
  }
}

function setObjectFields(target, fields) {
  let changed = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (JSON.stringify(target[key]) !== JSON.stringify(value)) {
      target[key] = value;
      changed++;
    }
  }
  return changed;
}

function applyPackagePatch(pkg, patch) {
  let changed = 0;
  const missing = [];

  if (patch.root) changed += setObjectFields(pkg, patch.root);

  const configuration = pkg.contributes?.configuration;
  if (configuration && patch.configurationTitle && configuration.title !== patch.configurationTitle) {
    configuration.title = patch.configurationTitle;
    changed++;
  }
  if (configuration?.properties && patch.configurationProperties) {
    for (const [name, fields] of Object.entries(patch.configurationProperties)) {
      const property = configuration.properties[name];
      if (!property) {
        missing.push(`configuration property ${name}`);
        continue;
      }
      changed += setObjectFields(property, fields);
    }
  }

  if (patch.commands) {
    const commands = pkg.contributes?.commands ?? [];
    for (const [commandId, fields] of Object.entries(patch.commands)) {
      const command = commands.find((item) => item.command === commandId);
      if (!command) {
        missing.push(`command ${commandId}`);
        continue;
      }
      changed += setObjectFields(command, fields);
    }
  }

  if (patch.viewsContainers) {
    for (const locations of Object.values(pkg.contributes?.viewsContainers ?? {})) {
      for (const container of locations) {
        const fields = patch.viewsContainers[container.id];
        if (fields) changed += setObjectFields(container, fields);
      }
    }
  }

  if (patch.views) {
    for (const views of Object.values(pkg.contributes?.views ?? {})) {
      for (const view of views) {
        const fields = patch.views[view.id];
        if (fields) changed += setObjectFields(view, fields);
      }
    }
  }

  if (patch.walkthroughs) {
    for (const [walkthroughId, fields] of Object.entries(patch.walkthroughs)) {
      const walkthrough = (pkg.contributes?.walkthroughs ?? []).find((item) => item.id === walkthroughId);
      if (!walkthrough) {
        missing.push(`walkthrough ${walkthroughId}`);
        continue;
      }
      const { steps, ...walkthroughFields } = fields;
      changed += setObjectFields(walkthrough, walkthroughFields);
      if (steps) {
        for (const [stepId, stepFields] of Object.entries(steps)) {
          const step = (walkthrough.steps ?? []).find((item) => item.id === stepId);
          if (!step) {
            missing.push(`walkthrough step ${stepId}`);
            continue;
          }
          changed += setObjectFields(step, stepFields);
        }
      }
    }
  }

  if (patch.untrustedWorkspaces) {
    pkg.capabilities ??= {};
    pkg.capabilities.untrustedWorkspaces ??= {};
    changed += setObjectFields(pkg.capabilities.untrustedWorkspaces, patch.untrustedWorkspaces);
  }

  return { changed, missing };
}

async function patchFile(extensionDir, relativePath, patch, options) {
  const filePath = path.join(extensionDir, relativePath);
  if (!(await pathExists(filePath))) {
    return { file: relativePath, changed: false, replacements: 0, already: 0, missing: [`missing file ${relativePath}`] };
  }

  if (patch.package) {
    const original = await fs.readFile(filePath, "utf8");
    const pkg = JSON.parse(original);
    const result = applyPackagePatch(pkg, patch.package);
    const next = `${JSON.stringify(pkg, null, 2)}\n`;
    if (next !== original) {
      await backupFile(filePath, options);
      if (!options.dryRun) await fs.writeFile(filePath, next);
      return { file: relativePath, changed: true, replacements: result.changed, already: 0, missing: result.missing };
    }
    return { file: relativePath, changed: false, replacements: 0, already: result.changed, missing: result.missing };
  }

  if (typeof patch.content === "string") {
    const original = await fs.readFile(filePath, "utf8");
    if (original !== patch.content) {
      await backupFile(filePath, options);
      if (!options.dryRun) await fs.writeFile(filePath, patch.content);
      return { file: relativePath, changed: true, replacements: 1, already: 0, missing: [] };
    }
    return { file: relativePath, changed: false, replacements: 0, already: 1, missing: [] };
  }

  const replacements = patch.replace ?? [];
  let text = await fs.readFile(filePath, "utf8");
  let total = 0;
  let already = 0;
  const missing = [];

  for (const item of replacements) {
    const from = item.from;
    const to = item.to;
    const count = countOccurrences(text, from);
    if (count > 0) {
      text = text.split(from).join(to);
      total += count;
    } else if (text.includes(to)) {
      already++;
    } else {
      missing.push(from);
    }
  }

  if (total > 0) {
    await backupFile(filePath, options);
    if (!options.dryRun) await fs.writeFile(filePath, text);
  }

  return { file: relativePath, changed: total > 0, replacements: total, already, missing };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.extensionDir = expandHome(options.extensionDir) ?? (await findExtensionDir());
  options.translations = expandHome(options.translations);

  if (!options.extensionDir) {
    throw new Error("Could not find Claude Code extension directory. Use --extension-dir <dir>.");
  }

  const packagePath = path.join(options.extensionDir, "package.json");
  if (!(await pathExists(packagePath))) {
    throw new Error(`Not a VS Code extension directory: ${options.extensionDir}`);
  }

  const table = JSON.parse(await fs.readFile(options.translations, "utf8"));
  const pkg = JSON.parse(await fs.readFile(packagePath, "utf8"));
  const installedVersion = pkg.version ?? "unknown";
  const testedVersions = table.testedVersions ?? [];

  if (testedVersions.length > 0 && !testedVersions.includes(installedVersion) && !options.force) {
    throw new Error(`Installed version is ${installedVersion}, but this table targets ${testedVersions.join(", ")}. Re-run with --force to try anyway.`);
  }

  console.log(`Extension: ${options.extensionDir}`);
  console.log(`Installed version: ${installedVersion}`);
  console.log(`Translations: ${options.translations}`);
  if (options.dryRun) console.log("Mode: dry-run");

  const results = [];
  for (const [relativePath, patch] of Object.entries(table.files ?? {})) {
    results.push(await patchFile(options.extensionDir, relativePath, patch, options));
  }

  let missingCount = 0;
  for (const result of results) {
    missingCount += result.missing.length;
    const status = result.changed ? "patched" : "unchanged";
    console.log(`${status}: ${result.file} (${result.replacements} replacements, ${result.already} already applied)`);
    for (const missing of result.missing.slice(0, 5)) console.warn(`  missing: ${missing}`);
    if (result.missing.length > 5) console.warn(`  ...and ${result.missing.length - 5} more missing entries`);
  }

  if (missingCount > 0 && !options.allowMissing) {
    throw new Error(`${missingCount} translation entries were not found. Use --allow-missing to ignore this.`);
  }

  console.log("Done. Reload VS Code / VS Code Server for changes to take effect.");
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
