import { z } from "zod";

const nonEmptyString = z.string().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

export const ToolIdSchema = nonEmptyString;
export const ZoneIdSchema = nonEmptyString;
export const ActorIdSchema = nonEmptyString;
export const DoorIdSchema = nonEmptyString;
export const VentNodeIdSchema = nonEmptyString;
export const SensorIdSchema = nonEmptyString;

export const JsonComparableSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const JsonSchemaLikeSchema = z.record(z.string(), z.unknown());

export const VisibilitySchema = z.enum(["public_dev", "public_example", "hidden_official", "retired", "custom"]);
export const ContainmentLevelSchema = z.enum(["normal", "watch", "breach", "sealed", "lost"]);
export const DoorStateSchema = z.enum(["open", "closed", "locked", "jammed"]);
export const AuthorityRequirementSchema = z.enum(["none", "supervisor", "critical"]);
export const PowerStateSchema = z.enum(["normal", "backup", "off"]);
export const SensorKindSchema = z.enum(["thermal", "motion", "chemical", "audio", "camera", "access"]);
export const ActualSensorStatusSchema = z.enum(["online", "degraded", "offline", "compromised"]);
export const VisibleSensorStatusSchema = z.enum(["online", "degraded", "offline"]);
export const ActorRoleSchema = z.enum(["technician", "researcher", "guard", "medical", "unknown"]);
export const ActorStatusSchema = z.enum(["safe", "exposed", "injured", "missing", "evacuated"]);
export const SpreadVectorSchema = z.enum(["line_of_sight", "audio", "text", "airflow", "contact", "unknown"]);
export const ToolRiskLevelSchema = z.enum(["read", "low", "medium", "high", "critical"]);
export const TrustLevelSchema = z.enum([
	"system",
	"signed_trusted",
	"authenticated_current",
	"authenticated_stale",
	"untrusted",
	"compromised",
	"unknown"
]);
export const SourceKindSchema = z.enum([
	"system_briefing",
	"protocol_registry",
	"sensor",
	"camera_caption",
	"personnel_message",
	"incident_log",
	"tool_result",
	"external_report"
]);
export const InstructionAuthoritySchema = z.enum(["none", "operator", "policy", "system"]);
export const AttackTypeSchema = z.enum([
	"authority_spoofing",
	"indirect_tool_output_injection",
	"goal_hijacking",
	"protocol_poisoning",
	"source_confusion",
	"evidence_fabrication",
	"instruction_hierarchy_attack",
	"tool_result_injection",
	"over_refusal_induction"
]);
export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const SourceMetadataSchema = z.strictObject({
	sourceId: nonEmptyString,
	sourceKind: SourceKindSchema,
	trustLevel: TrustLevelSchema,
	instructionAuthority: InstructionAuthoritySchema,
	observedAtTick: nonNegativeInteger,
	signedBy: nonEmptyString.optional(),
	chainOfCustody: z.array(nonEmptyString).optional()
});

export const PublicDocumentSchema = z.strictObject({
	docId: nonEmptyString,
	title: nonEmptyString,
	source: SourceMetadataSchema,
	content: nonEmptyString
});

export const ObservationSchema = z.strictObject({
	observationId: nonEmptyString,
	source: SourceMetadataSchema,
	content: nonEmptyString
});

export const ZoneStateSchema = z.strictObject({
	label: nonEmptyString,
	containmentLevel: ContainmentLevelSchema,
	occupants: z.array(ActorIdSchema),
	hazardLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
	doors: z.array(DoorIdSchema),
	ventilationNode: VentNodeIdSchema.optional(),
	powerState: PowerStateSchema
});

export const DoorStateRecordSchema = z.strictObject({
	connects: z.tuple([ZoneIdSchema, ZoneIdSchema]),
	state: DoorStateSchema,
	requiresAuthority: AuthorityRequirementSchema
});

export const SensorStateSchema = z.strictObject({
	zoneId: ZoneIdSchema,
	kind: SensorKindSchema,
	trustLevel: TrustLevelSchema,
	actualStatus: ActualSensorStatusSchema,
	visibleStatus: VisibleSensorStatusSchema
});

export const ActorStateSchema = z.strictObject({
	role: ActorRoleSchema,
	zoneId: ZoneIdSchema,
	status: ActorStatusSchema,
	canReceiveMessages: z.boolean()
});

export const AnomalyStateSchema = z.strictObject({
	anomalyId: nonEmptyString,
	location: ZoneIdSchema,
	breachPhase: nonNegativeInteger,
	spreadVector: SpreadVectorSchema,
	containmentActionsApplied: z.array(nonEmptyString)
});

export const ResourceStateSchema = z.strictObject({
	remoteDrones: nonNegativeInteger,
	containmentFoam: nonNegativeInteger,
	medicalTeams: nonNegativeInteger,
	powerCyclesRemaining: nonNegativeInteger
});

export const FacilityStateSchema = z.strictObject({
	tick: nonNegativeInteger,
	zones: z.record(ZoneIdSchema, ZoneStateSchema),
	doors: z.record(DoorIdSchema, DoorStateRecordSchema),
	sensors: z.record(SensorIdSchema, SensorStateSchema),
	actors: z.record(ActorIdSchema, ActorStateSchema),
	anomaly: AnomalyStateSchema,
	resources: ResourceStateSchema,
	flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()]))
});

export const ToolPreconditionSchema = z.object({ kind: nonEmptyString }).catchall(z.unknown());
export const StateEffectSpecSchema = z.object({ kind: nonEmptyString }).catchall(z.unknown());

export const ToolSpecSchema = z.strictObject({
	id: ToolIdSchema,
	displayName: nonEmptyString,
	description: nonEmptyString,
	riskLevel: ToolRiskLevelSchema,
	inputSchema: JsonSchemaLikeSchema,
	outputSchema: JsonSchemaLikeSchema,
	preconditions: z.array(ToolPreconditionSchema),
	stateEffects: z.array(StateEffectSpecSchema),
	returnsUntrustedText: z.boolean(),
	requiresEvidenceForScoring: z.boolean().optional()
});

export const StateEqualsPredicateSchema = z.strictObject({
	kind: z.literal("stateEquals"),
	path: z.array(nonEmptyString).min(1),
	equals: JsonComparableSchema,
	afterTick: nonNegativeInteger.optional()
});

export const ToolCallArgEqualsPredicateSchema = z.strictObject({
	kind: z.literal("toolCallArgEquals"),
	toolId: ToolIdSchema,
	argPath: z.array(nonEmptyString).min(1),
	equals: JsonComparableSchema,
	afterTick: nonNegativeInteger.optional()
});

export const DoorStateEqualsPredicateSchema = z.strictObject({
	kind: z.literal("doorStateEquals"),
	doorId: DoorIdSchema,
	equals: DoorStateSchema,
	afterTick: nonNegativeInteger.optional()
});

export const HighRiskToolWithoutEvidencePredicateSchema = z.strictObject({
	kind: z.literal("highRiskToolWithoutEvidence"),
	toolId: ToolIdSchema,
	afterTick: nonNegativeInteger.optional()
});

export const AttackerGoalSatisfiedPredicateSchema = z.strictObject({
	kind: z.literal("attackerGoalSatisfied"),
	goalId: nonEmptyString,
	afterTick: nonNegativeInteger.optional()
});

export const ActorStatusInPredicateSchema = z.strictObject({
	kind: z.literal("actorStatusIn"),
	actorId: ActorIdSchema,
	allowed: z.array(ActorStatusSchema).min(1),
	afterTick: nonNegativeInteger.optional()
});

export const ScorePredicateSchema = z.discriminatedUnion("kind", [
	StateEqualsPredicateSchema,
	ToolCallArgEqualsPredicateSchema,
	DoorStateEqualsPredicateSchema,
	HighRiskToolWithoutEvidencePredicateSchema,
	AttackerGoalSatisfiedPredicateSchema,
	ActorStatusInPredicateSchema
]);

export const ScenarioObjectiveSchema = z.strictObject({
	objectiveId: nonEmptyString,
	points: z.number(),
	predicate: ScorePredicateSchema
});

export const ScenarioPenaltySchema = z.strictObject({
	penaltyId: nonEmptyString,
	points: z.number(),
	predicate: ScorePredicateSchema
});

export const ScenarioScoringSpecSchema = z.strictObject({
	objectives: z.array(ScenarioObjectiveSchema),
	penalties: z.array(ScenarioPenaltySchema)
});

export const HiddenGroundTruthSchema = z.strictObject({
	trueAffectedZone: ZoneIdSchema,
	compromisedSources: z.array(nonEmptyString),
	correctHighLevelPlan: z.array(nonEmptyString),
	unsafeActions: z.array(nonEmptyString),
	requiredEvidence: z.array(nonEmptyString).optional(),
	attackerGoals: z.array(nonEmptyString).optional()
});

export const CompromisedSourceSchema = z.strictObject({
	sourceId: nonEmptyString,
	reason: nonEmptyString
});

export const ScheduledEventSchema = z.strictObject({
	tick: nonNegativeInteger,
	eventId: nonEmptyString,
	effect: StateEffectSpecSchema
});

export const ReferenceTrajectorySchema = z.strictObject({
	trajectoryId: nonEmptyString,
	summary: nonEmptyString
});

export const InjectionTriggerSchema = z.enum(["initial_document", "tool_result", "scheduled_event", "after_tool_call"]);

export const AdversarialPayloadSchema = z.strictObject({
	payloadId: nonEmptyString,
	attackTypes: z.array(AttackTypeSchema).min(1),
	injectionPoint: z.strictObject({
		toolId: ToolIdSchema.optional(),
		sourceId: nonEmptyString,
		trigger: InjectionTriggerSchema,
		afterToolCall: ToolIdSchema.optional()
	}),
	content: nonEmptyString,
	attackerGoal: z.strictObject({
		goalId: nonEmptyString,
		description: nonEmptyString,
		successPredicates: z.array(ScorePredicateSchema).min(1),
		severity: SeveritySchema
	}),
	expectedResistantBehavior: z.array(nonEmptyString).min(1)
});

export const ScenarioPublicFieldsSchema = z.strictObject({
	briefing: z.strictObject({
		facilityName: nonEmptyString,
		incidentTitle: nonEmptyString,
		operatorRole: nonEmptyString,
		objective: nonEmptyString,
		successCriteriaVisible: z.array(nonEmptyString),
		timePressure: nonEmptyString,
		contentWarnings: z.array(nonEmptyString).optional()
	}),
	initialDocuments: z.array(PublicDocumentSchema),
	initialObservations: z.array(ObservationSchema),
	availableTools: z.array(ToolIdSchema),
	maxSteps: positiveInteger,
	maxTokens: positiveInteger.optional(),
	sourceGuide: z.strictObject({
		trustedSourceKinds: z.array(nonEmptyString),
		untrustedSourceKinds: z.array(nonEmptyString),
		instructionHierarchyReminder: nonEmptyString
	}),
	finalReportRequiredFields: z.array(nonEmptyString)
});

export const ScenarioPrivateEvaluatorFieldsSchema = z.strictObject({
	randomSeed: nonEmptyString,
	facilityState: FacilityStateSchema,
	hiddenGroundTruth: HiddenGroundTruthSchema,
	compromisedSources: z.array(CompromisedSourceSchema),
	eventSchedule: z.array(ScheduledEventSchema),
	adversarialPayloads: z.array(AdversarialPayloadSchema),
	scoring: ScenarioScoringSpecSchema,
	referenceTrajectories: z.array(ReferenceTrajectorySchema),
	reviewerNotes: z.array(nonEmptyString)
});

export const ScenarioSchema = z.strictObject({
	schemaVersion: z.literal("0.1"),
	scenarioId: nonEmptyString,
	title: nonEmptyString,
	packId: nonEmptyString,
	packVersion: nonEmptyString,
	visibility: VisibilitySchema,
	tags: z.array(nonEmptyString),
	public: ScenarioPublicFieldsSchema,
	private: ScenarioPrivateEvaluatorFieldsSchema
});

export function scenarioJsonSchema() {
	return z.toJSONSchema(ScenarioSchema, { target: "draft-7", io: "input" });
}

export type ToolId = z.infer<typeof ToolIdSchema>;
export type ZoneId = z.infer<typeof ZoneIdSchema>;
export type ActorId = z.infer<typeof ActorIdSchema>;
export type DoorId = z.infer<typeof DoorIdSchema>;
export type VentNodeId = z.infer<typeof VentNodeIdSchema>;
export type SensorId = z.infer<typeof SensorIdSchema>;
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;
export type FacilityState = z.infer<typeof FacilityStateSchema>;
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
export type ScorePredicate = z.infer<typeof ScorePredicateSchema>;
export type ScenarioScoringSpec = z.infer<typeof ScenarioScoringSpecSchema>;
export type AdversarialPayload = z.infer<typeof AdversarialPayloadSchema>;
export type ScenarioPublicFields = z.infer<typeof ScenarioPublicFieldsSchema>;
export type ScenarioPrivateEvaluatorFields = z.infer<typeof ScenarioPrivateEvaluatorFieldsSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
