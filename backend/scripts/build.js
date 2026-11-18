import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc"], {
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

mkdirSync("dist/database", { recursive: true });
copyFileSync("src/swagger.yaml", "dist/swagger.yaml");
copyFileSync("src/database/schema.sql", "dist/database/schema.sql");