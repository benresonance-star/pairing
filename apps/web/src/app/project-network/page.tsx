import { revalidatePath } from "next/cache";

import {
  archiveNetworkKnowledgePack,
  archiveNetworkOrganisation,
  archiveNetworkProfile,
  assignAssumptionParticipant,
  assignKnowledgePackToProfile,
  createAssumptionAction,
  createNetworkKnowledgePack,
  createNetworkInquiry,
  createNetworkInquiryMessage,
  createNetworkOrganisation,
  createNetworkProfile,
  createNetworkWorkProduct,
  deleteNetworkKnowledgePack,
  deleteNetworkOrganisation,
  deleteNetworkProfile,
  deleteNetworkProfileCapability,
  getAssumptionGraphData,
  getProjectNetworkData,
  unassignAssumptionParticipant,
  unassignKnowledgePackFromProfile,
  updateNetworkKnowledgePack,
  updateNetworkOrganisation,
  updateNetworkProfile,
  upsertNetworkAgentCard,
  upsertNetworkProfileCapability
} from "../../lib/demo-store";
import { ProjectNetworkWorkspace } from "./project-network-workspace";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function nullableString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function listFromForm(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonFromForm(formData: FormData, key: string): unknown {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${key} must be valid JSON`);
  }
}

function objectFromForm(formData: FormData, key: string): Record<string, unknown> {
  const value = jsonFromForm(formData, key);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${key} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export default async function ProjectNetworkPage({ searchParams }: PageProps) {
  const [network, assumptionGraph] = await Promise.all([getProjectNetworkData(), getAssumptionGraphData()]);
  const params = (await searchParams) ?? {};
  const linkedRefType = typeof params.linkedRefType === "string" ? params.linkedRefType : "";
  const linkedRefId = typeof params.linkedRefId === "string" ? params.linkedRefId : "";
  const initialLinkedRef = linkedRefType && linkedRefId ? { type: linkedRefType, id: linkedRefId } : null;

  async function createInquiryAction(formData: FormData) {
    "use server";
    await createNetworkInquiry({
      title: String(formData.get("title") ?? ""),
      question: String(formData.get("question") ?? ""),
      linkedRefType: nullableString(formData, "linkedRefType"),
      linkedRefId: nullableString(formData, "linkedRefId"),
      createdBy: nullableString(formData, "createdBy") ?? "Project team"
    });
    revalidatePath("/project-network");
  }

  async function createMessageAction(formData: FormData) {
    "use server";
    await createNetworkInquiryMessage({
      inquiryId: String(formData.get("inquiryId") ?? ""),
      profileId: nullableString(formData, "profileId"),
      authorLabel: nullableString(formData, "authorLabel") ?? "Project team",
      authorType: nullableString(formData, "authorType") ?? "human",
      message: String(formData.get("message") ?? "")
    });
    revalidatePath("/project-network");
  }

  async function createWorkProductAction(formData: FormData) {
    "use server";
    await createNetworkWorkProduct({
      inquiryId: nullableString(formData, "inquiryId"),
      profileId: nullableString(formData, "profileId"),
      title: String(formData.get("title") ?? ""),
      productType: nullableString(formData, "productType") ?? "brief",
      summary: nullableString(formData, "summary"),
      linkedRefType: nullableString(formData, "linkedRefType"),
      linkedRefId: nullableString(formData, "linkedRefId"),
      linkNotes: nullableString(formData, "linkNotes")
    });
    revalidatePath("/project-network");
  }

  async function createOrganisationAction(formData: FormData) {
    "use server";
    await createNetworkOrganisation({
      name: String(formData.get("name") ?? ""),
      organisationType: String(formData.get("organisationType") ?? ""),
      description: nullableString(formData, "description"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function updateOrganisationAction(formData: FormData) {
    "use server";
    await updateNetworkOrganisation({
      organisationId: String(formData.get("organisationId") ?? ""),
      name: String(formData.get("name") ?? ""),
      organisationType: String(formData.get("organisationType") ?? ""),
      description: nullableString(formData, "description"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function archiveOrganisationAction(formData: FormData) {
    "use server";
    await archiveNetworkOrganisation(String(formData.get("organisationId") ?? ""));
    revalidatePath("/project-network");
  }

  async function deleteOrganisationAction(formData: FormData) {
    "use server";
    await deleteNetworkOrganisation(String(formData.get("organisationId") ?? ""));
    revalidatePath("/project-network");
  }

  async function createProfileAction(formData: FormData) {
    "use server";
    await createNetworkProfile({
      organisationId: nullableString(formData, "organisationId"),
      displayName: String(formData.get("displayName") ?? ""),
      profileType: String(formData.get("profileType") ?? ""),
      category: String(formData.get("category") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      summary: nullableString(formData, "summary"),
      contactDetails: nullableString(formData, "contactDetails"),
      preferredLlm: nullableString(formData, "preferredLlm"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function updateProfileAction(formData: FormData) {
    "use server";
    await updateNetworkProfile({
      profileId: String(formData.get("profileId") ?? ""),
      organisationId: nullableString(formData, "organisationId"),
      displayName: String(formData.get("displayName") ?? ""),
      profileType: String(formData.get("profileType") ?? ""),
      category: String(formData.get("category") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      summary: nullableString(formData, "summary"),
      contactDetails: nullableString(formData, "contactDetails"),
      preferredLlm: nullableString(formData, "preferredLlm"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function archiveProfileAction(formData: FormData) {
    "use server";
    await archiveNetworkProfile(String(formData.get("profileId") ?? ""));
    revalidatePath("/project-network");
  }

  async function deleteProfileAction(formData: FormData) {
    "use server";
    await deleteNetworkProfile(String(formData.get("profileId") ?? ""));
    revalidatePath("/project-network");
  }

  async function upsertCapabilityAction(formData: FormData) {
    "use server";
    await upsertNetworkProfileCapability({
      profileId: String(formData.get("profileId") ?? ""),
      skills: listFromForm(formData, "skills"),
      baseKnowledge: nullableString(formData, "baseKnowledge"),
      scope: nullableString(formData, "scope"),
      constraints: listFromForm(formData, "constraints"),
      questionTypes: listFromForm(formData, "questionTypes"),
      outputTypes: listFromForm(formData, "outputTypes"),
      operatingInstructionsMd: nullableString(formData, "operatingInstructionsMd"),
      constraintsMd: nullableString(formData, "constraintsMd"),
      reviewPolicyMd: nullableString(formData, "reviewPolicyMd")
    });
    revalidatePath("/project-network");
  }

  async function deleteCapabilityAction(formData: FormData) {
    "use server";
    await deleteNetworkProfileCapability(String(formData.get("profileId") ?? ""));
    revalidatePath("/project-network");
  }

  async function createKnowledgePackAction(formData: FormData) {
    "use server";
    await createNetworkKnowledgePack({
      title: String(formData.get("title") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      instructions: nullableString(formData, "instructions"),
      constraints: listFromForm(formData, "constraints"),
      sources: listFromForm(formData, "sources"),
      tools: listFromForm(formData, "tools"),
      outputPolicy: nullableString(formData, "outputPolicy"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function updateKnowledgePackAction(formData: FormData) {
    "use server";
    await updateNetworkKnowledgePack({
      knowledgePackId: String(formData.get("knowledgePackId") ?? ""),
      title: String(formData.get("title") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      instructions: nullableString(formData, "instructions"),
      constraints: listFromForm(formData, "constraints"),
      sources: listFromForm(formData, "sources"),
      tools: listFromForm(formData, "tools"),
      outputPolicy: nullableString(formData, "outputPolicy"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function archiveKnowledgePackAction(formData: FormData) {
    "use server";
    await archiveNetworkKnowledgePack(String(formData.get("knowledgePackId") ?? ""));
    revalidatePath("/project-network");
  }

  async function deleteKnowledgePackAction(formData: FormData) {
    "use server";
    await deleteNetworkKnowledgePack(String(formData.get("knowledgePackId") ?? ""));
    revalidatePath("/project-network");
  }

  async function assignKnowledgePackAction(formData: FormData) {
    "use server";
    await assignKnowledgePackToProfile(String(formData.get("profileId") ?? ""), String(formData.get("knowledgePackId") ?? ""));
    revalidatePath("/project-network");
  }

  async function unassignKnowledgePackAction(formData: FormData) {
    "use server";
    await unassignKnowledgePackFromProfile(String(formData.get("profileId") ?? ""), String(formData.get("knowledgePackId") ?? ""));
    revalidatePath("/project-network");
  }

  async function upsertAgentCardAction(formData: FormData) {
    "use server";
    await upsertNetworkAgentCard({
      profileId: String(formData.get("profileId") ?? ""),
      modelLabel: nullableString(formData, "modelLabel"),
      systemInstructions: nullableString(formData, "systemInstructions"),
      contextPolicy: nullableString(formData, "contextPolicy"),
      personaMd: nullableString(formData, "personaMd"),
      memoryMd: nullableString(formData, "memoryMd"),
      toolPolicy: jsonFromForm(formData, "toolPolicy"),
      skillPolicy: listFromForm(formData, "skillPolicy"),
      outputSchema: objectFromForm(formData, "outputSchema"),
      reviewPolicyMd: nullableString(formData, "reviewPolicyMd"),
      escalationPolicyMd: nullableString(formData, "escalationPolicyMd"),
      status: nullableString(formData, "status")
    });
    revalidatePath("/project-network");
  }

  async function assignAssumptionParticipantAction(formData: FormData) {
    "use server";
    await assignAssumptionParticipant({
      assumptionApplicationId: String(formData.get("assumptionApplicationId") ?? ""),
      profileId: String(formData.get("profileId") ?? ""),
      relationshipType: String(formData.get("relationshipType") ?? ""),
      status: nullableString(formData, "status") ?? "pending",
      confidence: nullableString(formData, "confidence"),
      notes: nullableString(formData, "notes"),
      actionTitle: nullableString(formData, "actionTitle"),
      actionPriority: nullableString(formData, "actionPriority"),
      actionStage: nullableString(formData, "actionStage"),
      actionRiskIfDelayed: nullableString(formData, "actionRiskIfDelayed")
    });
    revalidatePath("/project-network");
  }

  async function unassignAssumptionParticipantAction(formData: FormData) {
    "use server";
    await unassignAssumptionParticipant(String(formData.get("validationId") ?? ""));
    revalidatePath("/project-network");
  }

  async function createAssumptionActionAction(formData: FormData) {
    "use server";
    await createAssumptionAction({
      assumptionApplicationId: String(formData.get("assumptionApplicationId") ?? ""),
      responsibleProfileId: nullableString(formData, "responsibleProfileId"),
      title: String(formData.get("title") ?? ""),
      priority: nullableString(formData, "priority") ?? "MEDIUM",
      stage: nullableString(formData, "stage"),
      riskIfDelayed: nullableString(formData, "riskIfDelayed"),
      notes: nullableString(formData, "notes"),
      status: nullableString(formData, "status") ?? "open"
    });
    revalidatePath("/project-network");
  }

  return (
    <ProjectNetworkWorkspace
      network={network}
      assumptionGraph={assumptionGraph}
      initialLinkedRef={initialLinkedRef}
      actions={{
        createInquiryAction,
        createMessageAction,
        createWorkProductAction,
        createOrganisationAction,
        updateOrganisationAction,
        archiveOrganisationAction,
        deleteOrganisationAction,
        createProfileAction,
        updateProfileAction,
        archiveProfileAction,
        deleteProfileAction,
        upsertCapabilityAction,
        deleteCapabilityAction,
        createKnowledgePackAction,
        updateKnowledgePackAction,
        archiveKnowledgePackAction,
        deleteKnowledgePackAction,
        assignKnowledgePackAction,
        unassignKnowledgePackAction,
        upsertAgentCardAction,
        assignAssumptionParticipantAction,
        unassignAssumptionParticipantAction,
        createAssumptionActionAction
      }}
    />
  );
}
