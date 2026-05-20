// Intermediate Representation — the contract between parser and generators.
// Every generator reads from these types. Nothing else.

interface Property {
  name: string;
  type: TypeRef;
  required: boolean;
  description?: string;
  nullable: boolean;
  defaultValue?: unknown;
}

interface ObjectType {
  kind: "object";
  name: string;
  properties: Property[];
  description?: string;
  additionalProperties?: TypeRef | boolean;
}

interface ArrayType {
  kind: "array";
  items: TypeRef;
}

interface EnumType {
  kind: "enum";
  name: string;
  values: Array<string | number>;
  description?: string;
}

interface PrimitiveType {
  kind: "primitive";
  type: "string" | "number" | "integer" | "boolean";
  format?: string;
}

interface UnionType {
  kind: "union";
  variants: TypeRef[];
}

interface RefType {
  kind: "ref";
  name: string;
}

interface MapType {
  kind: "map";
  valueType: TypeRef;
}

type TypeRef =
  | ObjectType
  | ArrayType
  | EnumType
  | PrimitiveType
  | UnionType
  | RefType
  | MapType;

interface Parameter {
  name: string;
  location: "path" | "query" | "header";
  type: TypeRef;
  required: boolean;
  description?: string;
}

interface RequestBody {
  contentType: string;
  type: TypeRef;
  required: boolean;
}

interface Response {
  statusCode: number;
  contentType?: string;
  type?: TypeRef;
  description?: string;
}

const AUTH_STRATEGIES = ["apiKey", "bearer", "basic"] as const;
type AuthStrategy = (typeof AUTH_STRATEGIES)[number];

interface AuthScheme {
  strategy: AuthStrategy;
  headerName?: string;
  location?: "header" | "query";
}

interface Operation {
  id: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  groupName: string;
  description?: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Response[];
  auth: boolean;
  pagination?: PaginationConfig;
}

interface PaginationConfig {
  style: "offset" | "cursor";
  limitParam: string;
  offsetParam?: string;
  cursorParam?: string;
  cursorResponsePath?: string;
}

interface ServiceGroup {
  name: string;
  operations: Operation[];
  description?: string;
}

interface ApiSpec {
  name: string;
  version: string;
  baseUrl: string;
  description?: string;
  auth: AuthScheme[];
  models: Map<string, ObjectType | EnumType>;
  groups: ServiceGroup[];
}

export type {
  Property,
  ObjectType,
  ArrayType,
  EnumType,
  PrimitiveType,
  UnionType,
  RefType,
  MapType,
  TypeRef,
  Parameter,
  RequestBody,
  Response,
  AuthScheme,
  AuthStrategy,
  Operation,
  PaginationConfig,
  ServiceGroup,
  ApiSpec,
};

export { AUTH_STRATEGIES };
