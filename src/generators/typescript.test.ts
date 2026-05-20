import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { parseOpenApiSpec } from "../openapi-parser.js";
import { generateTypescriptSdk } from "./typescript.js";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../fixtures/petstore.yaml");
const OUTPUT_DIR = resolve(import.meta.dirname, "../../out/test-ts-sdk");

describe("TypeScript generator", () => {
  beforeAll(async () => {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    await generateTypescriptSdk(spec, OUTPUT_DIR);
  });

  it("generates package.json", async () => {
    const raw = await readFile(resolve(OUTPUT_DIR, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe("petstore");
    expect(pkg.type).toBe("module");
  });

  it("generates tsconfig.json", async () => {
    const raw = await readFile(resolve(OUTPUT_DIR, "tsconfig.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.compilerOptions.strict).toBe(true);
  });

  it("generates typed models", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/models.ts"), "utf-8");
    expect(content).toContain("export interface Pet");
    expect(content).toContain("id: string");
    expect(content).toContain("owner_id?: string | null");
  });

  it("generates client with auth config", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/client.ts"), "utf-8");
    expect(content).toContain("apiKey?: string");
    expect(content).toContain("Bearer");
    expect(content).toContain("class IngotClient");
  });

  it("generates resource files per group", async () => {
    const pets = await readFile(resolve(OUTPUT_DIR, "src/resources/pets.ts"), "utf-8");
    expect(pets).toContain("class PetsResource");
    expect(pets).toContain("listPets");
    expect(pets).toContain("createPet");
    expect(pets).toContain("getPet");
    expect(pets).toContain("deletePet");
  });

  it("generates entry point with exports", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/index.ts"), "utf-8");
    expect(content).toContain("export { IngotClient");
    expect(content).toContain("Pet");
  });

  it("includes retry logic in client", async () => {
    const content = await readFile(resolve(OUTPUT_DIR, "src/client.ts"), "utf-8");
    expect(content).toContain("maxRetries");
    expect(content).toContain("attempt");
  });
});
