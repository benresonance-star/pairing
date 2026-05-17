import { revalidatePath } from "next/cache";

import {
  addMasterDatabaseItemToTemplate,
  archiveMasterCodeItem,
  archiveMasterCostTemplate,
  archiveMasterDatabaseItem,
  createMasterCodeItem,
  createMasterCostItem,
  createMasterCostItemLink,
  createMasterCostTemplate,
  createMasterDatabaseItem,
  createMasterDatabaseItemSource,
  createMasterDatabaseTargetLink,
  deleteMasterDatabaseItem,
  deleteMasterDatabaseItemSource,
  deleteMasterDatabaseTargetLink,
  deleteMasterCodeItem,
  deleteMasterCostItem,
  deleteMasterCostItemLink,
  getFeasibilityPortfolio,
  updateMasterCostItem,
  updateMasterCostItemLink,
  updateMasterCostTemplate,
  updateMasterCodeItem,
  updateMasterDatabaseItem,
  updateMasterDatabaseItemSource,
  updateMasterDatabaseTargetLink,
  getAssumptionGraphData
} from "../../lib/demo-store";
import { AssumptionsWorkspace } from "./assumptions-workspace";

function textValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function nullableText(formData: FormData, key: string): string | null {
  const value = textValue(formData, key);
  return value ? value : null;
}

function nullableNumber(formData: FormData, key: string): number | null {
  const value = textValue(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be numeric`);
  }
  return parsed;
}

function requiredNumber(formData: FormData, key: string): number {
  const parsed = nullableNumber(formData, key);
  if (parsed === null) {
    throw new Error(`${key} is required`);
  }
  return parsed;
}

function templateItemInput(formData: FormData) {
  return {
    masterCostTemplateId: textValue(formData, "masterCostTemplateId"),
    masterCostItemId: nullableText(formData, "masterCostItemId"),
    masterCodeItemId: nullableText(formData, "masterCodeItemId"),
    parentItemId: nullableText(formData, "parentItemId"),
    costCode: textValue(formData, "costCode"),
    title: textValue(formData, "title"),
    tradeCode: nullableText(formData, "tradeCode"),
    packageId: nullableText(formData, "packageId"),
    estimateGranularity: textValue(formData, "estimateGranularity"),
    costingMethod: textValue(formData, "costingMethod"),
    unit: textValue(formData, "unit"),
    baseRate: requiredNumber(formData, "baseRate"),
    defaultQuantity: nullableNumber(formData, "defaultQuantity"),
    quantityBasis: nullableText(formData, "quantityBasis"),
    lowFactor: nullableNumber(formData, "lowFactor"),
    midFactor: nullableNumber(formData, "midFactor"),
    highFactor: nullableNumber(formData, "highFactor"),
    contingencyPercent: nullableNumber(formData, "contingencyPercent"),
    notes: nullableText(formData, "notes"),
    sortOrder: nullableNumber(formData, "sortOrder")
  };
}

function masterDatabaseItemInput(formData: FormData) {
  return {
    masterCodeItemId: nullableText(formData, "masterCodeItemId"),
    costCode: textValue(formData, "costCode"),
    title: textValue(formData, "title"),
    tradeCode: nullableText(formData, "tradeCode"),
    packageId: nullableText(formData, "packageId"),
    estimateGranularity: textValue(formData, "estimateGranularity"),
    costingMethod: textValue(formData, "costingMethod"),
    unit: textValue(formData, "unit"),
    baseRate: requiredNumber(formData, "baseRate"),
    sourceLabel: nullableText(formData, "sourceLabel"),
    sourceUrl: nullableText(formData, "sourceUrl"),
    sourceNotes: nullableText(formData, "sourceNotes"),
    notes: nullableText(formData, "notes"),
    status: textValue(formData, "status") || "active"
  };
}

function masterCodeItemInput(formData: FormData) {
  return {
    catalogId: textValue(formData, "catalogId"),
    parentItemId: nullableText(formData, "parentItemId"),
    code: textValue(formData, "code"),
    title: textValue(formData, "title"),
    codeType: textValue(formData, "codeType"),
    tradeCode: nullableText(formData, "tradeCode"),
    packageId: nullableText(formData, "packageId"),
    defaultUnit: nullableText(formData, "defaultUnit"),
    defaultEstimateGranularity: nullableText(formData, "defaultEstimateGranularity"),
    defaultCostingMethod: nullableText(formData, "defaultCostingMethod"),
    notes: nullableText(formData, "notes"),
    status: textValue(formData, "status") || "active",
    sortOrder: nullableNumber(formData, "sortOrder")
  };
}

async function createMasterCodeItemAction(formData: FormData) {
  "use server";
  await createMasterCodeItem(masterCodeItemInput(formData));
  revalidatePath("/base-costs");
}

async function updateMasterCodeItemAction(formData: FormData) {
  "use server";
  await updateMasterCodeItem({
    itemId: textValue(formData, "itemId"),
    ...masterCodeItemInput(formData)
  });
  revalidatePath("/base-costs");
}

async function archiveMasterCodeItemAction(formData: FormData) {
  "use server";
  await archiveMasterCodeItem(textValue(formData, "itemId"));
  revalidatePath("/base-costs");
}

async function deleteMasterCodeItemAction(formData: FormData) {
  "use server";
  await deleteMasterCodeItem(textValue(formData, "itemId"));
  revalidatePath("/base-costs");
}

async function createTemplateAction(formData: FormData) {
  "use server";
  await createMasterCostTemplate({
    name: textValue(formData, "name"),
    description: nullableText(formData, "description"),
    status: textValue(formData, "status") || "active",
    templateType: nullableText(formData, "templateType")
  });
  revalidatePath("/base-costs");
  revalidatePath("/feasibility");
}

async function updateTemplateAction(formData: FormData) {
  "use server";
  await updateMasterCostTemplate({
    templateId: textValue(formData, "templateId"),
    name: textValue(formData, "name"),
    description: nullableText(formData, "description"),
    status: textValue(formData, "status") || "active",
    templateType: nullableText(formData, "templateType")
  });
  revalidatePath("/base-costs");
  revalidatePath("/feasibility");
}

async function archiveTemplateAction(formData: FormData) {
  "use server";
  await archiveMasterCostTemplate(textValue(formData, "templateId"));
  revalidatePath("/base-costs");
  revalidatePath("/feasibility");
}

async function createMasterDatabaseItemAction(formData: FormData) {
  "use server";
  await createMasterDatabaseItem(masterDatabaseItemInput(formData));
  revalidatePath("/base-costs");
}

async function updateMasterDatabaseItemAction(formData: FormData) {
  "use server";
  await updateMasterDatabaseItem({
    itemId: textValue(formData, "itemId"),
    ...masterDatabaseItemInput(formData)
  });
  revalidatePath("/base-costs");
}

async function archiveMasterDatabaseItemAction(formData: FormData) {
  "use server";
  await archiveMasterDatabaseItem(textValue(formData, "itemId"));
  revalidatePath("/base-costs");
}

async function deleteMasterDatabaseItemAction(formData: FormData) {
  "use server";
  await deleteMasterDatabaseItem(textValue(formData, "itemId"));
  revalidatePath("/base-costs");
}

function masterDatabaseSourceInput(formData: FormData) {
  return {
    masterCostItemId: textValue(formData, "masterCostItemId"),
    sourceType: nullableText(formData, "sourceType"),
    sourceLabel: textValue(formData, "sourceLabel"),
    sourceUrl: nullableText(formData, "sourceUrl"),
    sourceDate: nullableText(formData, "sourceDate"),
    confidence: nullableText(formData, "confidence"),
    notes: nullableText(formData, "notes")
  };
}

async function createMasterDatabaseItemSourceAction(formData: FormData) {
  "use server";
  await createMasterDatabaseItemSource(masterDatabaseSourceInput(formData));
  revalidatePath("/base-costs");
}

async function updateMasterDatabaseItemSourceAction(formData: FormData) {
  "use server";
  await updateMasterDatabaseItemSource({
    sourceId: textValue(formData, "sourceId"),
    ...masterDatabaseSourceInput(formData)
  });
  revalidatePath("/base-costs");
}

async function deleteMasterDatabaseItemSourceAction(formData: FormData) {
  "use server";
  await deleteMasterDatabaseItemSource(textValue(formData, "sourceId"));
  revalidatePath("/base-costs");
}

function masterDatabaseTargetLinkInput(formData: FormData) {
  return {
    masterCostItemId: textValue(formData, "masterCostItemId"),
    targetType: textValue(formData, "targetType"),
    targetRef: textValue(formData, "targetRef"),
    linkBasis: nullableText(formData, "linkBasis"),
    notes: nullableText(formData, "notes")
  };
}

async function createMasterDatabaseTargetLinkAction(formData: FormData) {
  "use server";
  await createMasterDatabaseTargetLink(masterDatabaseTargetLinkInput(formData));
  revalidatePath("/base-costs");
}

async function updateMasterDatabaseTargetLinkAction(formData: FormData) {
  "use server";
  await updateMasterDatabaseTargetLink({
    linkId: textValue(formData, "linkId"),
    ...masterDatabaseTargetLinkInput(formData)
  });
  revalidatePath("/base-costs");
}

async function deleteMasterDatabaseTargetLinkAction(formData: FormData) {
  "use server";
  await deleteMasterDatabaseTargetLink(textValue(formData, "linkId"));
  revalidatePath("/base-costs");
}

async function addMasterDatabaseItemToTemplateAction(formData: FormData) {
  "use server";
  await addMasterDatabaseItemToTemplate({
    masterCostItemId: textValue(formData, "masterCostItemId"),
    masterCostTemplateId: textValue(formData, "masterCostTemplateId"),
    parentItemId: nullableText(formData, "parentItemId"),
    defaultQuantity: nullableNumber(formData, "defaultQuantity"),
    quantityBasis: nullableText(formData, "quantityBasis"),
    lowFactor: nullableNumber(formData, "lowFactor"),
    midFactor: nullableNumber(formData, "midFactor"),
    highFactor: nullableNumber(formData, "highFactor"),
    contingencyPercent: nullableNumber(formData, "contingencyPercent"),
    sortOrder: nullableNumber(formData, "sortOrder"),
    notes: nullableText(formData, "notes")
  });
  revalidatePath("/base-costs");
}

async function createTemplateOnlyItemAction(formData: FormData) {
  "use server";
  await createMasterCostItem(templateItemInput(formData));
  revalidatePath("/base-costs");
}

async function updateTemplateItemAction(formData: FormData) {
  "use server";
  await updateMasterCostItem({
    itemId: textValue(formData, "itemId"),
    ...templateItemInput(formData)
  });
  revalidatePath("/base-costs");
}

async function deleteTemplateItemAction(formData: FormData) {
  "use server";
  await deleteMasterCostItem(textValue(formData, "itemId"));
  revalidatePath("/base-costs");
}

async function createTemplateItemLinkAction(formData: FormData) {
  "use server";
  await createMasterCostItemLink({
    masterCostTemplateItemId: textValue(formData, "masterCostTemplateItemId"),
    targetType: textValue(formData, "targetType"),
    targetRef: textValue(formData, "targetRef"),
    linkBasis: nullableText(formData, "linkBasis"),
    notes: nullableText(formData, "notes")
  });
  revalidatePath("/base-costs");
}

async function updateTemplateItemLinkAction(formData: FormData) {
  "use server";
  await updateMasterCostItemLink({
    linkId: textValue(formData, "linkId"),
    masterCostTemplateItemId: textValue(formData, "masterCostTemplateItemId"),
    targetType: textValue(formData, "targetType"),
    targetRef: textValue(formData, "targetRef"),
    linkBasis: nullableText(formData, "linkBasis"),
    notes: nullableText(formData, "notes")
  });
  revalidatePath("/base-costs");
}

async function deleteTemplateItemLinkAction(formData: FormData) {
  "use server";
  await deleteMasterCostItemLink(textValue(formData, "linkId"));
  revalidatePath("/base-costs");
}

export default async function BaseCostsPage() {
  const [portfolio, assumptionGraph] = await Promise.all([getFeasibilityPortfolio(), getAssumptionGraphData()]);

  return (
    <AssumptionsWorkspace
      portfolio={portfolio}
      graph={assumptionGraph}
      actions={{
        createTemplateAction,
        updateTemplateAction,
        archiveTemplateAction,
        createMasterDatabaseItemAction,
        updateMasterDatabaseItemAction,
        archiveMasterDatabaseItemAction,
        deleteMasterDatabaseItemAction,
        createMasterDatabaseItemSourceAction,
        updateMasterDatabaseItemSourceAction,
        deleteMasterDatabaseItemSourceAction,
        createMasterDatabaseTargetLinkAction,
        updateMasterDatabaseTargetLinkAction,
        deleteMasterDatabaseTargetLinkAction,
        createMasterCodeItemAction,
        updateMasterCodeItemAction,
        archiveMasterCodeItemAction,
        deleteMasterCodeItemAction,
        addMasterDatabaseItemToTemplateAction,
        createTemplateOnlyItemAction,
        updateTemplateItemAction,
        deleteTemplateItemAction,
        createTemplateItemLinkAction,
        updateTemplateItemLinkAction,
        deleteTemplateItemLinkAction
      }}
    />
  );
}
