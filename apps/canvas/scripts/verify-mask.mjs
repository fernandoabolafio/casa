import { readFileSync } from "node:fs";

const coreSource = readFileSync(new URL("../lib/image-mask-core.ts", import.meta.url), "utf8");

if (!coreSource.includes("image.width === mask.width")) {
  throw new Error("Mask width validation is missing.");
}

if (!coreSource.includes("image.height === mask.height")) {
  throw new Error("Mask height validation is missing.");
}

console.log("Mask dimension verification passed.");
