import { mergeConfig } from "vitest/config";
import base from "./vitest.base.ts";

export default mergeConfig(base, {
  test: {
    name: "unit",
    environment: "node",
    include: ["test/**/*.test.ts", "!test/worker.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
