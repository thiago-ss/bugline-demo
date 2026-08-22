import { mergeConfig } from "vitest/config";
import base from "./vitest.base.ts";

export default mergeConfig(base, {
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["test/ui.test.tsx"],
  },
});
