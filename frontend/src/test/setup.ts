import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:preview";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => undefined;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
