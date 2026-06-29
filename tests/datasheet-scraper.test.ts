import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(
  ROOT,
  "scripts",
  "datasheet-scraper",
  "datasheet_to_board.py",
);
const FIXTURE_PATH = path.join(
  ROOT,
  "scripts",
  "datasheet-scraper",
  "examples",
  "super52840.raw.json",
);

test("datasheet scraper generates a ModuMake board JSON definition", () => {
  const stdout = execFileSync("python3", [SCRIPT_PATH, FIXTURE_PATH, "--format", "json"], {
    cwd: ROOT,
    encoding: "utf-8",
  });

  const board = JSON.parse(stdout) as {
    id: string;
    name: string;
    logicVoltage: string;
    targetLanguage: string;
    digitalPins: string[];
    leftPins: string[];
    pinDefinitions: Array<{ id: string; type: string[] }>;
  };

  assert.equal(board.id, "super52840");
  assert.equal(board.name, "Super52840");
  assert.equal(board.logicVoltage, "3.3V");
  assert.equal(board.targetLanguage, "C++");
  assert.deepEqual(board.digitalPins, ["P0.13", "P0.14", "P1.00", "P1.01", "P1.02"]);
  assert.deepEqual(board.leftPins, ["P0.02", "P0.03", "3V3", "VBUS", "GND"]);

  const analogPin = board.pinDefinitions.find((pin) => pin.id === "P0.02");
  const pwmPin = board.pinDefinitions.find((pin) => pin.id === "P0.13");
  const powerPin = board.pinDefinitions.find((pin) => pin.id === "3V3");
  const groundPin = board.pinDefinitions.find((pin) => pin.id === "GND");

  assert.deepEqual(analogPin?.type, ["DIGITAL", "ANALOG"]);
  assert.deepEqual(pwmPin?.type, ["DIGITAL", "PWM"]);
  assert.deepEqual(powerPin?.type, ["POWER"]);
  assert.deepEqual(groundPin?.type, ["GND"]);
});

test("datasheet scraper can emit TypeScript output", () => {
  const stdout = execFileSync(
    "python3",
    [SCRIPT_PATH, FIXTURE_PATH, "--format", "ts", "--export-name", "SUPER52840_BOARD"],
    {
      cwd: ROOT,
      encoding: "utf-8",
    },
  );

  assert.match(stdout, /export const SUPER52840_BOARD: BoardDefinition =/);
  assert.match(stdout, /"id": "super52840"/);
  assert.match(stdout, /"logicVoltage": "3\.3V"/);
  assert.match(stdout, /"leftPins": \[/);
});
