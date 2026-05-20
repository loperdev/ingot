import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { parseOpenApiSpec } from "../openapi-parser.js";
import { generatePythonSdk } from "./python.js";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../fixtures/petstore.yaml");
const OUTPUT_DIR = resolve(import.meta.dirname, "../../out/test-py-sdk");

describe("Python generator", () => {
  beforeAll(async () => {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    await generatePythonSdk(spec, OUTPUT_DIR);
  });

  it("generates pyproject.toml", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "pyproject.toml"), "utf-8");
    expect(content).toContain('name = "petstore"');
    expect(content).toContain("httpx");
    expect(content).toContain("pydantic");
  });

  it("generates Pydantic models", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/petstore/models.py"), "utf-8");
    expect(content).toContain("class Pet(BaseModel):");
    expect(content).toContain("id: str");
    expect(content).toContain("owner_id: str | None");
  });

  it("generates client with auth and retries", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/petstore/client.py"), "utf-8");
    expect(content).toContain("class IngotClient:");
    expect(content).toContain("api_key");
    expect(content).toContain("Bearer");
    expect(content).toContain("max_retries");
  });

  it("generates resource files", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/petstore/resources/pets.py"), "utf-8");
    expect(content).toContain("class PetsResource:");
    expect(content).toContain("def list_pets");
    expect(content).toContain("def create_pet");
  });

  it("generates __init__.py with exports", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/petstore/__init__.py"), "utf-8");
    expect(content).toContain("from .client import IngotClient");
    expect(content).toContain("Pet");
  });

  it("client supports context manager", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/petstore/client.py"), "utf-8");
    expect(content).toContain("def __enter__");
    expect(content).toContain("def __exit__");
  });
});
