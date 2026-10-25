import { spawnSync } from "node:child_process";

// Inspect reachable blobs without printing matching credentials. Read-only: no history rewriting.
const run = (args, input) => {
  const result = spawnSync("git", args, { input, maxBuffer: 100 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout;
};
const objects = run(["rev-list", "--objects", "--all"]).toString("utf8").trim().split("\n");
const paths = new Map(objects.map((line) => { const index = line.indexOf(" "); return [index < 0 ? line : line.slice(0, index), index < 0 ? "(git object)" : line.slice(index + 1)]; }));
const output = run(["cat-file", "--batch"], [...paths.keys()].join("\n") + "\n");
const patterns = [
  ["Baidu API key", /bce-v3\/ALTAK-[A-Za-z0-9_-]+\/[a-fA-F0-9]{30,}/],
  ["model API key", /\bsk-[A-Za-z0-9_-]{24,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{25,}\b|github_pat_[A-Za-z0-9_]{30,}/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];
const findings = [];
let position = 0, blobs = 0;
while (position < output.length) {
  const end = output.indexOf(10, position);
  if (end < 0) break;
  const [sha, type, sizeText] = output.subarray(position, end).toString("utf8").split(" ");
  const size = Number(sizeText);
  if (!Number.isFinite(size)) throw new Error("Invalid git batch response");
  const content = output.subarray(end + 1, end + 1 + size);
  position = end + 1 + size + 1;
  if (type !== "blob") continue;
  blobs++;
  const text = content.toString("utf8");
  for (const [kind, expression] of patterns) if (expression.test(text)) findings.push({ kind, path: paths.get(sha), object: sha.slice(0, 12) });
  if (/^(?:.*\/)?\.env(?:\.(?!example$).*)?$/.test(paths.get(sha) || "")) findings.push({ kind: "private environment file", path: paths.get(sha), object: sha.slice(0, 12) });
}
console.log(JSON.stringify({ checkedBlobs: blobs, findings }, null, 2));
if (findings.length) process.exitCode = 1;
