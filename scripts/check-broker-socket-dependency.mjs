import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const socketModule = resolve("src/worker-broker-socket.ts");
const socketTest = resolve("tests/worker-broker-socket.test.ts");
if (!existsSync(socketModule) || !existsSync(socketTest)) {
  throw new Error("Missing worker broker socket implementation or tests");
}
const implementation = readFileSync(socketModule, "utf8");
if (!implementation.includes("export async function startWorkerBrokerSocket(")) {
  throw new Error("Missing startWorkerBrokerSocket export");
}
for (const path of [
  "scripts/verify-broker-cross-uid.mjs",
  "scripts/verify-three-uid-isolation.mjs",
]) {
  if (!existsSync(resolve(path))) {
    throw new Error("Missing cross-UID probe: " + path);
  }
}
console.log("PASS: broker socket implementation, tests and probes are present");
