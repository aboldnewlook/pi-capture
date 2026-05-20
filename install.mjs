#!/usr/bin/env node

/**
 * pi-capture installer
 *
 * Usage:
 *   npx pi-capture          # Install to ~/.pi/agent/extensions/pi-capture
 *   npx pi-capture --remove # Remove the extension
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const EXTENSION_DIR = path.join(os.homedir(), ".pi", "agent", "extensions", "pi-capture");
const REPO_URL = "https://github.com/aboldnewlook/pi-capture.git";

const args = process.argv.slice(2);
const isRemove = args.includes("--remove") || args.includes("-r");
const isHelp = args.includes("--help") || args.includes("-h");

if (isHelp) {
  console.log(`
pi-capture — Pi extension for capturing and triaging issues into Linear

Usage:
  npx pi-capture          Install the extension
  npx pi-capture --remove Remove the extension
  npx pi-capture --help   Show this help

Installation directory: ${EXTENSION_DIR}
`);
  process.exit(0);
}

if (isRemove) {
  if (fs.existsSync(EXTENSION_DIR)) {
    console.log(`Removing ${EXTENSION_DIR}...`);
    fs.rmSync(EXTENSION_DIR, { recursive: true });
    console.log("pi-capture removed");
  } else {
    console.log("pi-capture is not installed");
  }
  process.exit(0);
}

// Install
console.log("Installing pi-capture...\n");

const parentDir = path.dirname(EXTENSION_DIR);
if (!fs.existsSync(parentDir)) {
  fs.mkdirSync(parentDir, { recursive: true });
}

if (fs.existsSync(EXTENSION_DIR)) {
  const isGitRepo = fs.existsSync(path.join(EXTENSION_DIR, ".git"));
  if (isGitRepo) {
    console.log("Updating existing installation...");
    try {
      execSync("git pull", { cwd: EXTENSION_DIR, stdio: "inherit" });
      console.log("\npi-capture updated");
    } catch {
      console.error("Failed to update. Try removing and reinstalling:");
      console.error("  npx pi-capture --remove && npx pi-capture");
      process.exit(1);
    }
  } else {
    console.log(`Directory exists but is not a git repo: ${EXTENSION_DIR}`);
    console.log("Remove it first with: npx pi-capture --remove");
    process.exit(1);
  }
} else {
  console.log(`Cloning to ${EXTENSION_DIR}...`);
  try {
    execSync(`git clone ${REPO_URL} "${EXTENSION_DIR}"`, { stdio: "inherit" });
    console.log("\npi-capture installed");
  } catch {
    console.error("Failed to clone repository. Once the repo is pushed to GitHub, re-run this command.");
    console.error(`Alternatively, copy the package manually to: ${EXTENSION_DIR}`);
    process.exit(1);
  }
}

console.log(`
pi-capture is now available in pi. Commands added:
  • /capture <text>        — interactively classify and file an issue
  • /capture:async <text>  — fire-and-forget, tagged needs-triage
  • /capture:triage        — walk the needs-triage queue

Next step: add .pi/pi-capture.json to your repo.
Documentation: ${EXTENSION_DIR}/README.md
`);
