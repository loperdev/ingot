import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "./openapi-parser.js";
import { resolve } from "node:path";

const FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/petstore.yaml");

describe("parseOpenApiSpec", () => {
  it("parses spec metadata", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    expect(spec.name).toBe("Petstore");
    expect(spec.version).toBe("1.0.0");
    expect(spec.baseUrl).toBe("https://api.petstore.example.com/v1");
  });

  it("extracts auth schemes", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    expect(spec.auth).toHaveLength(1);
    expect(spec.auth[0].strategy).toBe("bearer");
  });

  it("parses models", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    expect(spec.models.has("Pet")).toBe(true);
    expect(spec.models.has("CreatePetRequest")).toBe(true);
    expect(spec.models.has("Owner")).toBe(true);

    const pet = spec.models.get("Pet")!;
    expect(pet.kind).toBe("object");
    if (pet.kind === "object") {
      expect(pet.properties.find((p) => p.name === "id")?.required).toBe(true);
      expect(pet.properties.find((p) => p.name === "owner_id")?.nullable).toBe(true);
    }
  });

  it("groups operations by tag", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    const groupNames = spec.groups.map((g) => g.name);
    expect(groupNames).toContain("pets");
    expect(groupNames).toContain("owners");
  });

  it("parses path parameters", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    const petsGroup = spec.groups.find((g) => g.name === "pets")!;
    const getPet = petsGroup.operations.find((op) => op.id === "getPet")!;
    expect(getPet.parameters.find((p) => p.name === "petId")?.location).toBe("path");
  });

  it("parses request bodies", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    const petsGroup = spec.groups.find((g) => g.name === "pets")!;
    const createPet = petsGroup.operations.find((op) => op.id === "createPet")!;
    expect(createPet.requestBody).toBeDefined();
    expect(createPet.requestBody?.required).toBe(true);
  });

  it("detects pagination config", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    const petsGroup = spec.groups.find((g) => g.name === "pets")!;
    const listPets = petsGroup.operations.find((op) => op.id === "listPets")!;
    expect(listPets.pagination).toBeDefined();
    expect(listPets.pagination?.style).toBe("cursor");

    const ownersGroup = spec.groups.find((g) => g.name === "owners")!;
    const listOwners = ownersGroup.operations.find((op) => op.id === "listOwners")!;
    expect(listOwners.pagination).toBeDefined();
    expect(listOwners.pagination?.style).toBe("offset");
  });

  it("marks operations as requiring auth", async () => {
    const spec = await parseOpenApiSpec(FIXTURE_PATH);
    const petsGroup = spec.groups.find((g) => g.name === "pets")!;
    expect(petsGroup.operations.every((op) => op.auth)).toBe(true);
  });
});
