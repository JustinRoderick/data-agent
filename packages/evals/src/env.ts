import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

export function loadEvalEnv(): void {
  for (const path of ["apps/server/.env", "../../apps/server/.env", ".env"]) {
    const resolved = resolve(path);

    if (existsSync(resolved)) {
      config({ path: resolved });
    }
  }
}
