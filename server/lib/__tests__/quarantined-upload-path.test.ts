import path from "path";
import { describe, expect, it } from "vitest";
import { QUARANTINE_DIR, quarantinedUploadPath } from "../upload-config";

describe("quarantinedUploadPath", () => {
  it("accepts a file multer wrote into the quarantine folder", () => {
    const file = path.join(QUARANTINE_DIR, "upload_123.csv");
    expect(quarantinedUploadPath(file)).toBe(path.resolve(file));
  });

  it("refuses paths outside the quarantine folder", () => {
    expect(quarantinedUploadPath(path.join(QUARANTINE_DIR, "..", "secret.txt"))).toBeNull();
    expect(quarantinedUploadPath("/etc/passwd")).toBeNull();
    expect(quarantinedUploadPath(QUARANTINE_DIR)).toBeNull();
    expect(quarantinedUploadPath(QUARANTINE_DIR + "-other/file.csv")).toBeNull();
  });

  it("refuses anything that isn't a path", () => {
    expect(quarantinedUploadPath(undefined)).toBeNull();
    expect(quarantinedUploadPath("")).toBeNull();
    expect(quarantinedUploadPath(42)).toBeNull();
  });
});
