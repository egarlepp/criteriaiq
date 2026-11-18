// @vitest-environment node
//
// Coverage for the on-disk migration-failure marker (Task #394).
//
// The marker file lives at `<cwd>/data/last-migration-failure.json` so
// it survives container restarts on Dokploy / Coolify alongside the
// existing `data/db-config.json`. We exercise the real fs path here
// rather than mocking it, so the test doubles as a check that we
// honour the actual data/ convention.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  _markerFilePathForTests,
  clearMigrationFailureMarker,
  readMigrationFailureMarker,
  recordMigrationFailure,
} from "../migration-failure-marker";

const MARKER = _markerFilePathForTests();
// path.dirname, not a "/"-only regex: on Windows the marker path uses
// backslashes, the regex never matched, and `mkdirSync(<marker path>)`
// created a DIRECTORY named last-migration-failure.json that made every
// later write fail with EISDIR.
const DATA_DIR = path.dirname(MARKER);

function ensureClean() {
  try {
    if (fs.existsSync(MARKER)) {
      // Heal checkouts where the old regex bug left a directory behind.
      if (fs.statSync(MARKER).isDirectory()) {
        fs.rmSync(MARKER, { recursive: true, force: true });
      } else {
        fs.unlinkSync(MARKER);
      }
    }
  } catch {
    // ignore
  }
}

beforeEach(() => ensureClean());
afterEach(() => ensureClean());

describe("recordMigrationFailure / readMigrationFailureMarker", () => {
  it("returns null when no marker file exists", () => {
    expect(readMigrationFailureMarker()).toBeNull();
  });

  it("persists and reads back a structured marker", () => {
    const ok = recordMigrationFailure({
      filename: "023_add_foo_index.sql",
      sqlState: "42703",
      error: 'column "foo" does not exist',
      failedAt: "2026-04-26T12:00:00.000Z",
    });
    expect(ok).toBe(true);
    expect(fs.existsSync(MARKER)).toBe(true);

    const read = readMigrationFailureMarker();
    expect(read).toEqual({
      filename: "023_add_foo_index.sql",
      sqlState: "42703",
      error: 'column "foo" does not exist',
      failedAt: "2026-04-26T12:00:00.000Z",
    });
  });

  it("normalises a missing sqlState to null", () => {
    recordMigrationFailure({
      filename: "010_no_state.sql",
      sqlState: null,
      error: "spawn error: SIGKILL",
      failedAt: "2026-04-26T12:00:00.000Z",
    });
    const read = readMigrationFailureMarker();
    expect(read?.sqlState).toBeNull();
  });

  it("creates the data/ directory if it does not yet exist", () => {
    // The first-run docker image ships without `data/` because the
    // host mount is empty until the wizard runs. Recording must
    // create the directory itself rather than throwing ENOENT.
    if (fs.existsSync(DATA_DIR)) {
      // Best-effort cleanup of just the marker; we don't rmdir the
      // whole data/ because db-config.json may live next to it.
      ensureClean();
    }
    const ok = recordMigrationFailure({
      filename: "001_first.sql",
      sqlState: null,
      error: "boom",
      failedAt: "2026-04-26T00:00:00.000Z",
    });
    expect(ok).toBe(true);
    expect(fs.existsSync(MARKER)).toBe(true);
  });
});

describe("clearMigrationFailureMarker", () => {
  it("is a no-op when no marker exists", () => {
    expect(() => clearMigrationFailureMarker()).not.toThrow();
    expect(readMigrationFailureMarker()).toBeNull();
  });

  it("removes the marker file when present", () => {
    recordMigrationFailure({
      filename: "021_x.sql",
      sqlState: "23505",
      error: "duplicate key",
      failedAt: "2026-04-26T01:02:03.000Z",
    });
    expect(fs.existsSync(MARKER)).toBe(true);
    clearMigrationFailureMarker();
    expect(fs.existsSync(MARKER)).toBe(false);
    expect(readMigrationFailureMarker()).toBeNull();
  });
});

describe("readMigrationFailureMarker resilience", () => {
  it("returns null when the file is not valid JSON", () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MARKER, "{not json", "utf8");
    expect(readMigrationFailureMarker()).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      MARKER,
      JSON.stringify({ filename: "x.sql" }), // no error / failedAt
      "utf8",
    );
    expect(readMigrationFailureMarker()).toBeNull();
  });
});
