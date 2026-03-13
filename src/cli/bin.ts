import fs from "node:fs";

import { runCli } from "./index.ts";

const result = await runCli(process.argv.slice(2), {}, { cwd: process.cwd(), env: process.env });

if (result.stdout.length > 0) {
  fs.writeSync(process.stdout.fd, `${result.stdout}\n`);
}

if (result.stderr.length > 0) {
  fs.writeSync(process.stderr.fd, `${result.stderr}\n`);
}

process.exitCode = result.exitCode;
