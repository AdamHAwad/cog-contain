export const COG_CONTAIN_CORE_PACKAGE = "@cog-contain/core" as const;

export type CoreImplementationStatus = "phase-6p-resource-cost-metrics-foundation";

export const coreImplementationStatus: CoreImplementationStatus = "phase-6p-resource-cost-metrics-foundation";

// @ts-ignore Node's strip-types runtime needs the TypeScript extension for this package-root browser schema export.
export * from "./schema/scenario.ts";
// @ts-ignore Node's strip-types runtime needs the TypeScript extension for this package-root browser/server validation helper export.
export * from "./schema/scenarioDraftValidation.ts";
