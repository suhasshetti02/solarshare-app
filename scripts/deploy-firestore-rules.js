const { spawnSync } = require("node:child_process");

const projectId = "smart-grid-dev2";
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["firebase-tools", "deploy", "--only", "firestore:rules", "--project", projectId];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  stdio: "inherit",
});

if (result.error) {
  console.error("Could not start Firebase CLI deploy:", result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
