import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type {
  ApiSpec,
  AuthScheme,
  EnumType,
  ObjectType,
  Operation,
  PaginationConfig,
  Parameter,
  Property,
  RequestBody,
  Response,
  ServiceGroup,
  TypeRef,
} from "./ir.js";

// OpenAPI 3.x types — only what we actually use from the spec
interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOperation> & { parameters?: OpenApiParameter[] }>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
}

interface OpenApiSchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: Array<string | number>;
  $ref?: string;
  description?: string;
  nullable?: boolean;
  default?: unknown;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  additionalProperties?: OpenApiSchema | boolean;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: OpenApiSchema }>;
  };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, { schema: OpenApiSchema }> }
  >;
  security?: Array<Record<string, string[]>>;
}

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema: OpenApiSchema;
}

interface OpenApiSecurityScheme {
  type: string;
  scheme?: string;
  name?: string;
  in?: string;
  bearerFormat?: string;
}

function resolveRef(doc: OpenApiDocument, ref: string): OpenApiSchema {
  const path = ref.replace("#/", "").split("/");
  let current: unknown = doc;
  for (const segment of path) {
    current = (current as Record<string, unknown>)[segment];
  }
  return current as OpenApiSchema;
}

const RESERVED_WORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "undefined", "var", "void", "while", "with", "yield",
  "implements", "interface", "package", "private", "protected", "public", "static",
]);

function sanitizeTypeName(name: string): string {
  let result = name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (RESERVED_WORDS.has(result.toLowerCase())) {
    result = result.charAt(0).toUpperCase() + result.slice(1) + "_";
  }
  return result;
}

function extractRefName(ref: string): string {
  return sanitizeTypeName(ref.split("/").pop()!);
}

function resolveSchema(doc: OpenApiDocument, schema: OpenApiSchema): OpenApiSchema {
  if (schema.$ref) {
    return resolveRef(doc, schema.$ref);
  }
  return schema;
}

function parseTypeRef(doc: OpenApiDocument, schema: OpenApiSchema): TypeRef {
  if (!schema) {
    return { kind: "primitive", type: "string" };
  }

  if (schema.$ref) {
    return { kind: "ref", name: extractRefName(schema.$ref) };
  }

  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf)!.map((s) =>
      parseTypeRef(doc, s),
    );
    return { kind: "union", variants };
  }

  if (schema.allOf) {
    // Merge allOf into a single object type
    const merged: OpenApiSchema = { type: "object", properties: {}, required: [] };
    for (const sub of schema.allOf) {
      const resolved = resolveSchema(doc, sub);
      if (resolved.properties) {
        Object.assign(merged.properties!, resolved.properties);
      }
      if (resolved.required) {
        merged.required!.push(...resolved.required);
      }
    }
    return parseTypeRef(doc, merged);
  }

  if (schema.enum) {
    const values = schema.enum.filter((v: unknown) => v !== "" && v !== null && v !== undefined);
    if (values.length === 0) {
      return { kind: "primitive", type: "string" };
    }
    return {
      kind: "enum",
      name: "",
      values,
      description: schema.description,
    };
  }

  if (schema.type === "array" && schema.items) {
    return { kind: "array", items: parseTypeRef(doc, schema.items) };
  }

  if (schema.type === "object" || schema.properties) {
    if (
      schema.additionalProperties &&
      !schema.properties &&
      typeof schema.additionalProperties !== "boolean"
    ) {
      return {
        kind: "map",
        valueType: parseTypeRef(doc, schema.additionalProperties),
      };
    }

    const properties: Property[] = Object.entries(
      schema.properties ?? {},
    ).map(([name, prop]) => ({
      name,
      type: parseTypeRef(doc, prop),
      required: schema.required?.includes(name) ?? false,
      description: prop.description,
      nullable: prop.nullable ?? false,
      defaultValue: prop.default,
    }));

    const result: ObjectType = {
      kind: "object",
      name: "",
      properties,
      description: schema.description,
    };

    if (schema.additionalProperties) {
      result.additionalProperties =
        typeof schema.additionalProperties === "boolean"
          ? true
          : parseTypeRef(doc, schema.additionalProperties);
    }

    return result;
  }

  if (
    schema.type === "string" ||
    schema.type === "number" ||
    schema.type === "integer" ||
    schema.type === "boolean"
  ) {
    return { kind: "primitive", type: schema.type, format: schema.format };
  }

  // Fallback for untyped schemas
  return { kind: "primitive", type: "string" };
}

function parseAuth(doc: OpenApiDocument): AuthScheme[] {
  const schemes = doc.components?.securitySchemes ?? {};
  const result: AuthScheme[] = [];

  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === "http" && scheme.scheme === "bearer") {
      result.push({ strategy: "bearer" });
    } else if (scheme.type === "http" && scheme.scheme === "basic") {
      result.push({ strategy: "basic" });
    } else if (scheme.type === "apiKey") {
      result.push({
        strategy: "apiKey",
        headerName: scheme.name,
        location: scheme.in as "header" | "query",
      });
    }
  }

  return result;
}

function parseModels(
  doc: OpenApiDocument,
): Map<string, TypeRef & { name: string }> {
  const models = new Map<string, TypeRef & { name: string }>();
  const schemas = doc.components?.schemas ?? {};

  for (const [rawName, schema] of Object.entries(schemas)) {
    const name = sanitizeTypeName(rawName);
    const typeRef = parseTypeRef(doc, schema);
    models.set(name, { ...typeRef, name } as TypeRef & { name: string });
  }

  return models;
}

function inferPagination(
  params: Parameter[],
  responses: Response[],
): PaginationConfig | undefined {
  const hasLimit = params.some(
    (p) => p.name === "limit" || p.name === "per_page" || p.name === "page_size",
  );
  const hasCursor = params.some(
    (p) => p.name === "cursor" || p.name === "after" || p.name === "starting_after",
  );
  const hasOffset = params.some(
    (p) => p.name === "offset" || p.name === "page" || p.name === "skip",
  );

  if (!hasLimit) return undefined;

  const limitParam =
    params.find((p) => ["limit", "per_page", "page_size"].includes(p.name))
      ?.name ?? "limit";

  if (hasCursor) {
    const cursorParam =
      params.find((p) => ["cursor", "after", "starting_after"].includes(p.name))
        ?.name ?? "cursor";
    return {
      style: "cursor",
      limitParam,
      cursorParam,
      cursorResponsePath: "next_cursor",
    };
  }

  if (hasOffset) {
    const offsetParam =
      params.find((p) => ["offset", "page", "skip"].includes(p.name))?.name ??
      "offset";
    return { style: "offset", limitParam, offsetParam };
  }

  return undefined;
}

function slugify(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function parseOperations(doc: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];

  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method] as OpenApiOperation | undefined;
      if (!op) continue;

      const pathLevelParams = (methods.parameters ?? []) as OpenApiParameter[];
      const opLevelParams = op.parameters ?? [];
      const opParamNames = new Set(opLevelParams.map((p) => (p as unknown as { $ref?: string }).$ref ?? `${(p as OpenApiParameter).in}:${(p as OpenApiParameter).name}`));
      const mergedRawParams = [
        ...opLevelParams,
        ...pathLevelParams.filter((p) => {
          const key = (p as unknown as { $ref?: string }).$ref ?? `${p.in}:${p.name}`;
          return !opParamNames.has(key);
        }),
      ];

      const seenParamNames = new Set<string>();
      const parameters: Parameter[] = mergedRawParams
        .map((p) => {
          if ((p as unknown as { $ref: string }).$ref) {
            const refPath = (p as unknown as { $ref: string }).$ref.replace("#/", "").split("/");
            let resolved: unknown = doc;
            for (const seg of refPath) {
              resolved = (resolved as Record<string, unknown>)[seg];
            }
            return resolved as OpenApiParameter;
          }
          return p;
        })
        .filter((p) => p.in !== "cookie")
        .map((p) => {
          let name = p.name.replace(/[^a-zA-Z0-9_]/g, "");
          if (seenParamNames.has(name)) {
            let suffix = 2;
            while (seenParamNames.has(`${name}${suffix}`)) suffix++;
            name = `${name}${suffix}`;
          }
          seenParamNames.add(name);
          return {
            name,
            wireName: p.name,
            location: p.in as "path" | "query" | "header",
            type: parseTypeRef(doc, p.schema),
            required: p.required ?? false,
            description: p.description,
          };
        });

      let requestBody: RequestBody | undefined;
      if (op.requestBody) {
        let reqBody = op.requestBody;
        if ((reqBody as unknown as { $ref: string }).$ref) {
          const refPath = (reqBody as unknown as { $ref: string }).$ref.replace("#/", "").split("/");
          let resolved: unknown = doc;
          for (const seg of refPath) {
            resolved = (resolved as Record<string, unknown>)[seg];
          }
          reqBody = resolved as typeof reqBody;
        }
        const content = reqBody.content;
        const jsonContent = content?.["application/json"];
        if (jsonContent?.schema) {
          requestBody = {
            contentType: "application/json",
            type: parseTypeRef(doc, jsonContent.schema),
            required: op.requestBody.required ?? false,
          };
        }
      }

      const responses: Response[] = [];
      for (const [statusCode, res] of Object.entries(op.responses ?? {})) {
        const code = statusCode === "default" ? 200 : parseInt(statusCode, 10);
        const jsonContent = res.content?.["application/json"];
        responses.push({
          statusCode: code,
          contentType: jsonContent ? "application/json" : undefined,
          type: jsonContent?.schema ? parseTypeRef(doc, jsonContent.schema) : undefined,
          description: res.description,
        });
      }

      const hasGlobalSecurity = (doc.security ?? []).length > 0;
      const hasOperationSecurity = op.security !== undefined;
      const authRequired = hasOperationSecurity
        ? op.security!.length > 0
        : hasGlobalSecurity;

      const pagination = inferPagination(parameters, responses);

      const id =
        op.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const rawGroup =
        op.tags?.[0] ?? path.split("/").filter(Boolean)[0] ?? "default";
      const groupName = slugify(rawGroup);

      operations.push({
        id,
        method,
        path,
        groupName,
        description: op.description ?? op.summary,
        parameters,
        requestBody,
        responses,
        auth: authRequired,
        pagination,
      });
    }
  }

  return operations;
}

function groupOperations(operations: Operation[]): ServiceGroup[] {
  const groups = new Map<string, Operation[]>();

  for (const op of operations) {
    const existing = groups.get(op.groupName) ?? [];
    existing.push(op);
    groups.set(op.groupName, existing);
  }

  return Array.from(groups.entries()).map(([name, ops]) => ({
    name,
    operations: ops,
  }));
}

async function parseOpenApiSpec(specPath: string): Promise<ApiSpec> {
  const raw = await readFile(specPath, "utf-8");
  const doc: OpenApiDocument = specPath.endsWith(".json")
    ? JSON.parse(raw)
    : parseYaml(raw);

  if (!doc.openapi?.startsWith("3.")) {
    throw new Error(`Unsupported OpenAPI version: ${doc.openapi}. Ingot supports 3.x.`);
  }

  const operations = parseOperations(doc);

  return {
    name: doc.info.title,
    version: doc.info.version,
    baseUrl: doc.servers?.[0]?.url ?? "https://api.example.com",
    description: doc.info.description,
    auth: parseAuth(doc),
    models: parseModels(doc),
    groups: groupOperations(operations),
  };
}

export { parseOpenApiSpec };
