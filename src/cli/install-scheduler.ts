/**
 * Installs (or removes) a macOS LaunchAgent that runs the scheduler every 5 minutes,
 * so autopilot posts go out without a terminal open (the Mac must be on/awake;
 * posts missed while asleep go out at the next run).
 *
 *   npx tsx src/cli/install-scheduler.ts            install / update
 *   npx tsx src/cli/install-scheduler.ts --remove   uninstall
 *
 * Logs: library/scheduler.log
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LIB, ROOT } from "../config.js";

const LABEL = "com.slideflow.scheduler";
const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const uid = process.getuid?.() ?? 501;

const unload = () => {
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}`, plist], { stdio: "ignore" });
  } catch {}
};

if (process.argv.includes("--remove")) {
  unload();
  fs.rmSync(plist, { force: true });
  console.log(`Removed ${LABEL}.`);
  process.exit(0);
}

if (ROOT.includes("scratch-workspaces")) {
  console.error("This project is in a temporary session folder that gets deleted. Move it to a permanent folder first.");
  process.exit(1);
}

const npx = execFileSync("which", ["npx"]).toString().trim();
const nodeBin = path.dirname(process.execPath);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${npx}</string><string>tsx</string><string>src/cli/scheduler.ts</string><string>--once</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${nodeBin}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${path.join(LIB, "scheduler.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(LIB, "scheduler.log")}</string>
</dict></plist>
`;
fs.mkdirSync(path.dirname(plist), { recursive: true });
unload();
fs.writeFileSync(plist, xml);
execFileSync("launchctl", ["bootstrap", `gui/${uid}`, plist]);
console.log(`Installed ${LABEL}: runs every 5 minutes. Log: ${path.join(LIB, "scheduler.log")}`);
