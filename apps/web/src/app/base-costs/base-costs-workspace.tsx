"use client";

import { Fragment, useMemo, useState } from "react";

import type { FeasibilityPortfolio } from "../../lib/feasibility";

const ESTIMATE_GRANULARITIES = ["allowance", "provisional_sum", "system", "element", "assembly", "material"];
const COSTING_METHODS = ["rate_per_sqm", "fixed_sum", "rate_per_item", "rate_per_lm", "rate_per_m3", "rate_per_hour"];
const TARGET_TYPES = ["archicad_element", "archicad_assembly", "archicad_zone", "package", "activity", "constraint", "app_item"];

type ServerAction = (formData: FormData) => Promise<void>;
type Template = FeasibilityPortfolio["masterCostTemplates"][number];
type TemplateItem = Template["items"][number];
type MasterDatabaseItem = FeasibilityPortfolio["masterCostItems"][number];
type MasterCodeItem = FeasibilityPortfolio["masterCodeItems"][number];
type MasterItemLike = NonNullable<TemplateItem["sourceItem"]> & {
  sources?: MasterDatabaseItem["sources"];
  targetLinks?: MasterDatabaseItem["targetLinks"];
};

export type BaseCostsActions = {
  createTemplateAction: ServerAction;
  updateTemplateAction: ServerAction;
  archiveTemplateAction: ServerAction;
  createMasterDatabaseItemAction: ServerAction;
  updateMasterDatabaseItemAction: ServerAction;
  archiveMasterDatabaseItemAction: ServerAction;
  deleteMasterDatabaseItemAction: ServerAction;
  createMasterDatabaseItemSourceAction: ServerAction;
  updateMasterDatabaseItemSourceAction: ServerAction;
  deleteMasterDatabaseItemSourceAction: ServerAction;
  createMasterDatabaseTargetLinkAction: ServerAction;
  updateMasterDatabaseTargetLinkAction: ServerAction;
  deleteMasterDatabaseTargetLinkAction: ServerAction;
  createMasterCodeItemAction: ServerAction;
  updateMasterCodeItemAction: ServerAction;
  archiveMasterCodeItemAction: ServerAction;
  deleteMasterCodeItemAction: ServerAction;
  addMasterDatabaseItemToTemplateAction: ServerAction;
  createTemplateOnlyItemAction: ServerAction;
  updateTemplateItemAction: ServerAction;
  deleteTemplateItemAction: ServerAction;
  createTemplateItemLinkAction: ServerAction;
  updateTemplateItemLinkAction: ServerAction;
  deleteTemplateItemLinkAction: ServerAction;
};

type DrawerState =
  | { type: "template"; templateId: string }
  | { type: "templateItem"; templateId: string; itemId: string }
  | { type: "masterItem"; itemId: string }
  | { type: "newTemplate" }
  | { type: "newMasterItem" }
  | { type: "codeItem"; itemId: string }
  | { type: "newCodeItem" }
  | { type: "addMasterToTemplate"; masterItemId: string }
  | { type: "templateOnlyItem"; templateId: string };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(value);
}

function itemTotal(item: { base_rate: number; default_quantity?: number | null }): number {
  return Math.round(Number(item.base_rate ?? 0) * Number(item.default_quantity ?? 1));
}

function Options({ values, current }: { values: string[]; current?: string | null }) {
  return (
    <>
      {values.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
      {current && !values.includes(current) ? <option value={current}>{current}</option> : null}
    </>
  );
}

function buildChildren(template: Template, parentId: string | null): TemplateItem[] {
  const ids = new Set(template.items.map((item) => item.id));
  return template.items.filter((item) => {
    const itemParentId = item.parent_item_id ?? null;
    if (parentId === null) {
      return itemParentId === null || !ids.has(itemParentId);
    }
    return itemParentId === parentId;
  });
}

function masterItemSummary(masterItems: MasterDatabaseItem[]) {
  return {
    linked: masterItems.filter((item) => item.targetLinks.length > 0).length,
    allowance: masterItems.filter((item) => ["allowance", "provisional_sum"].includes(String(item.estimate_granularity))).length,
    total: masterItems.reduce((sum, item) => sum + Number(item.base_rate ?? 0), 0)
  };
}

function templateSummary(template: Template) {
  return {
    total: template.items.reduce((sum, item) => sum + itemTotal(item), 0),
    linked: template.items.filter((item) => item.sourceItem || item.links.length > 0).length,
    allowance: template.items.filter((item) => ["allowance", "provisional_sum"].includes(String(item.estimate_granularity))).length
  };
}

function usageForMasterItem(templates: Template[], itemId: string) {
  return templates.flatMap((template) =>
    template.items
      .filter((item) => item.master_cost_item_id === itemId)
      .map((item) => ({ template, item }))
  );
}

function activeCodeItems(portfolio: FeasibilityPortfolio, type?: string) {
  return portfolio.masterCodeItems.filter((item) => item.status !== "archived" && (!type || item.code_type === type));
}

function codeItemLabel(item: MasterCodeItem): string {
  return `${item.code} - ${item.title}`;
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="drawer-field-grid">{children}</div>;
}

function CostTreeRows({
  template,
  parentId,
  level,
  onSelect
}: {
  template: Template;
  parentId: string | null;
  level: number;
  onSelect: (item: TemplateItem) => void;
}) {
  return (
    <>
      {buildChildren(template, parentId).map((item) => {
        const children = buildChildren(template, item.id);
        return (
          <Fragment key={item.id}>
            <tr className="cost-tree-table-row" onClick={() => onSelect(item)}>
              <td>
                <div className="cost-tree-line-item" style={{ paddingLeft: `${level * 24}px` }}>
                  <span className="tree-toggle">{children.length > 0 ? "-" : "+"}</span>
                  <span className="cost-code">{item.cost_code}</span>
                  <strong>{item.title}</strong>
                  {item.sourceItem ? <span className="tag">linked source</span> : <span className="tag">template-only</span>}
                </div>
              </td>
              <td>
                <span className="tag">{item.estimate_granularity}</span>
              </td>
              <td>
                <span className="tag">{item.costing_method}</span>
              </td>
              <td>
                {item.default_quantity ?? 1} {item.unit} @ {formatCurrency(Number(item.base_rate ?? 0))}
              </td>
              <td>
                <strong>{formatCurrency(itemTotal(item))}</strong>
              </td>
              <td>
                <span className="cost-link-chip-row">
                  {item.links.length > 0 ? (
                    item.links.map((link) => (
                      <span className="cost-link-chip" key={link.id}>
                        {link.target_type}: {link.target_ref}
                      </span>
                    ))
                  ) : (
                    <span className="cost-link-chip cost-link-chip--empty">No links</span>
                  )}
                </span>
              </td>
              <td>
                <button type="button" onClick={() => onSelect(item)}>
                  Edit
                </button>
              </td>
            </tr>
            {children.length > 0 ? (
              <CostTreeRows template={template} parentId={item.id} level={level + 1} onSelect={onSelect} />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

function MasterDatabaseView({
  masterItems,
  templates,
  onSelect,
  onAddToTemplate
}: {
  masterItems: MasterDatabaseItem[];
  templates: Template[];
  onSelect: (item: MasterDatabaseItem) => void;
  onAddToTemplate: (item: MasterDatabaseItem) => void;
}) {
  return (
    <section className="master-cost-list">
      <div className="cost-tree-table-wrap">
        <table className="cost-tree-table">
          <thead>
            <tr>
              <th>Cost Code</th>
              <th>Title</th>
              <th>Unit</th>
              <th>Base Rate</th>
              <th>Method</th>
              <th>Source</th>
              <th>Targets</th>
              <th>Usage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {masterItems.map((item) => (
              <tr className="cost-tree-table-row" key={item.id} onClick={() => onSelect(item)}>
                <td>
                  <span className="cost-code">{item.cost_code}</span>
                </td>
                <td>
                  <strong>{item.title}</strong>
                  <div className="muted">{item.notes ?? item.source_notes ?? "No notes"}</div>
                </td>
                <td>{item.unit}</td>
                <td>{formatCurrency(Number(item.base_rate ?? 0))}</td>
                <td>
                  <span className="tag">{item.costing_method}</span>
                </td>
                <td>{item.source_label ?? item.sources[0]?.source_label ?? "No source"}</td>
                <td>
                  <span className="cost-link-chip-row">
                    {item.targetLinks.length > 0 ? (
                      item.targetLinks.map((link) => (
                        <span className="cost-link-chip" key={link.id}>
                          {link.target_type}: {link.target_ref}
                        </span>
                      ))
                    ) : (
                      <span className="cost-link-chip cost-link-chip--empty">No targets</span>
                    )}
                  </span>
                </td>
                <td>{usageForMasterItem(templates, item.id).length} templates</td>
                <td>
                  <span className="tag">{item.status ?? "active"}</span>
                </td>
                <td className="table-actions">
                  <button type="button" onClick={() => onSelect(item)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => onAddToTemplate(item)}>
                    Add to Template
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TemplateView({
  templates,
  activeTemplateId,
  onTemplateSelect,
  onItemSelect,
  onTemplateEdit,
  onAddTemplateOnly
}: {
  templates: Template[];
  activeTemplateId: string;
  onTemplateSelect: (templateId: string) => void;
  onItemSelect: (template: Template, item: TemplateItem) => void;
  onTemplateEdit: (templateId: string) => void;
  onAddTemplateOnly: (templateId: string) => void;
}) {
  const activeTemplate = templates.find((template) => template.id === activeTemplateId) ?? templates[0] ?? null;

  return (
    <section className="cost-template-list">
      {templates.map((template) => {
        const summary = templateSummary(template);
        const isActive = template.id === activeTemplate?.id;
        return (
          <div className={`cost-template-row ${isActive ? "is-active" : ""}`} key={template.id}>
            <button type="button" className="cost-template-row-main" onClick={() => onTemplateSelect(template.id)}>
              <span>{isActive ? "-" : "+"}</span>
              <strong>{template.name}</strong>
              <span className="tag">{template.template_type ?? "general"}</span>
              <span>{formatCurrency(summary.total)}</span>
              <span className="muted">{template.items.length} line items</span>
            </button>
            {isActive ? (
              <div className="expanded-template-panel">
                <div className="template-metric-strip">
                  <span>
                    <strong>Base Total</strong>
                    {formatCurrency(summary.total)}
                  </span>
                  <span>
                    <strong>Linked Items</strong>
                    {summary.linked}
                  </span>
                  <span>
                    <strong>Allowance Risk</strong>
                    {summary.allowance}
                  </span>
                  <span>
                    <strong>Source</strong>
                    linked template items stay connected
                  </span>
                </div>
                <div className="cost-template-actions">
                  <button type="button" onClick={() => onTemplateEdit(template.id)}>
                    Template Settings
                  </button>
                  <button type="button" onClick={() => onAddTemplateOnly(template.id)}>
                    + Template-only Item
                  </button>
                </div>
                <div className="cost-tree-table-wrap">
                  <table className="cost-tree-table">
                    <thead>
                      <tr>
                        <th>Line Item</th>
                        <th>Granularity</th>
                        <th>Costing Method</th>
                        <th>Qty / Rate</th>
                        <th>Base Total</th>
                        <th>Links</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <CostTreeRows template={template} parentId={null} level={0} onSelect={(item) => onItemSelect(template, item)} />
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function CodeCatalogView({
  items,
  onSelect,
  onCreate
}: {
  items: MasterCodeItem[];
  onSelect: (item: MasterCodeItem) => void;
  onCreate: () => void;
}) {
  return (
    <section className="master-cost-list">
      <div className="section-heading app-title-panel app-title-panel--compact">
        <div className="app-title-panel__content">
          <p className="eyebrow">Code System</p>
          <h2>Global Code Catalogue</h2>
          <p className="muted">Shared cost, construction, trade, and package codes used by every project.</p>
        </div>
        <button type="button" onClick={onCreate}>
          + New Code Item
        </button>
      </div>
      <div className="cost-tree-table-wrap">
        <table className="cost-tree-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Title</th>
              <th>Type</th>
              <th>Trade</th>
              <th>Package</th>
              <th>Defaults</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="cost-tree-table-row" key={item.id} onClick={() => onSelect(item)}>
                <td>
                  <span className="cost-code">{item.code}</span>
                </td>
                <td>
                  <strong>{item.title}</strong>
                  <div className="muted">{item.notes ?? "Global dropdown source"}</div>
                </td>
                <td>
                  <span className="tag">{item.code_type}</span>
                </td>
                <td>{item.trade_code ?? "-"}</td>
                <td>{item.package_id ?? "-"}</td>
                <td>
                  {[item.default_unit, item.default_estimate_granularity, item.default_costing_method].filter(Boolean).join(" / ") || "-"}
                </td>
                <td>
                  <span className="tag">{item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CodeItemFields({
  item,
  portfolio
}: {
  item?: MasterCodeItem;
  portfolio: FeasibilityPortfolio;
}) {
  const catalogs = portfolio.masterCodeCatalogs;
  const items = portfolio.masterCodeItems.filter((candidate) => candidate.id !== item?.id);
  return (
    <FieldGrid>
      <label>
        <span>Catalog</span>
        <select name="catalogId" defaultValue={item?.catalog_id ?? catalogs[0]?.id ?? ""} required>
          {catalogs.map((catalog) => (
            <option key={catalog.id} value={catalog.id}>
              {catalog.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Parent</span>
        <select name="parentItemId" defaultValue={item?.parent_item_id ?? ""}>
          <option value="">No parent</option>
          {items.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {codeItemLabel(candidate)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Code</span>
        <input name="code" defaultValue={item?.code ?? ""} required />
      </label>
      <label>
        <span>Title</span>
        <input name="title" defaultValue={item?.title ?? ""} required />
      </label>
      <label>
        <span>Type</span>
        <select name="codeType" defaultValue={item?.code_type ?? "cost_item"}>
          <option value="section">section</option>
          <option value="trade">trade</option>
          <option value="package">package</option>
          <option value="cost_item">cost_item</option>
        </select>
      </label>
      <label>
        <span>Trade code</span>
        <input name="tradeCode" defaultValue={item?.trade_code ?? ""} />
      </label>
      <label>
        <span>Package id</span>
        <input name="packageId" defaultValue={item?.package_id ?? ""} />
      </label>
      <label>
        <span>Default unit</span>
        <input name="defaultUnit" defaultValue={item?.default_unit ?? ""} />
      </label>
      <label>
        <span>Default granularity</span>
        <select name="defaultEstimateGranularity" defaultValue={item?.default_estimate_granularity ?? ""}>
          <option value="">No default</option>
          <Options values={ESTIMATE_GRANULARITIES} current={item?.default_estimate_granularity} />
        </select>
      </label>
      <label>
        <span>Default method</span>
        <select name="defaultCostingMethod" defaultValue={item?.default_costing_method ?? ""}>
          <option value="">No default</option>
          <Options values={COSTING_METHODS} current={item?.default_costing_method} />
        </select>
      </label>
      <label>
        <span>Status</span>
        <select name="status" defaultValue={item?.status ?? "active"}>
          <option value="active">active</option>
          <option value="draft">draft</option>
          <option value="archived">archived</option>
        </select>
      </label>
      <label>
        <span>Sort</span>
        <input name="sortOrder" type="number" step="1" defaultValue={item?.sort_order ?? ""} />
      </label>
      <label className="drawer-field-wide">
        <span>Notes</span>
        <input name="notes" defaultValue={item?.notes ?? ""} />
      </label>
    </FieldGrid>
  );
}

function MasterItemFields({
  item,
  portfolio,
  section = "all"
}: {
  item?: MasterItemLike;
  portfolio: FeasibilityPortfolio;
  section?: "all" | "details" | "pricing" | "notes";
}) {
  const costItems = activeCodeItems(portfolio, "cost_item");
  const tradeItems = activeCodeItems(portfolio, "trade");
  const packageItems = activeCodeItems(portfolio, "package");
  const initialCatalogItem = costItems.find((candidate) => candidate.id === item?.master_code_item_id) ?? null;
  const [selectedCode, setSelectedCode] = useState<MasterCodeItem | null>(initialCatalogItem);
  const codeSource = selectedCode ?? initialCatalogItem;
  const titleDefault = item?.title ?? codeSource?.title ?? "";
  const costCodeDefault = item?.cost_code ?? codeSource?.code ?? "";
  const tradeDefault = item?.trade_code ?? codeSource?.trade_code ?? "";
  const packageDefault = item?.package_id ?? codeSource?.package_id ?? "";
  const unitDefault = item?.unit ?? codeSource?.default_unit ?? "";
  const granularityDefault = item?.estimate_granularity ?? codeSource?.default_estimate_granularity ?? "allowance";
  const methodDefault = item?.costing_method ?? codeSource?.default_costing_method ?? "rate_per_sqm";
  return (
    <FieldGrid>
      {section === "all" || section === "details" ? (
        <>
          <label className="drawer-field-wide">
            <span>Catalog code</span>
            <select
              name="masterCodeItemId"
              value={selectedCode?.id ?? item?.master_code_item_id ?? ""}
              onChange={(event) => setSelectedCode(costItems.find((candidate) => candidate.id === event.target.value) ?? null)}
            >
              <option value="">No catalog link</option>
              {costItems.map((codeItem) => (
                <option key={codeItem.id} value={codeItem.id}>
                  {codeItemLabel(codeItem)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Code</span>
            <input name="costCode" key={`code-${costCodeDefault}`} defaultValue={costCodeDefault} required />
          </label>
          <label>
            <span>Title</span>
            <input name="title" key={`title-${titleDefault}`} defaultValue={titleDefault} required />
          </label>
          <label>
            <span>Trade</span>
            <select name="tradeCode" key={`trade-${tradeDefault}`} defaultValue={tradeDefault}>
              <option value="">No trade</option>
              {tradeItems.map((codeItem) => (
                <option key={codeItem.id} value={codeItem.code}>
                  {codeItemLabel(codeItem)}
                </option>
              ))}
              {tradeDefault && !tradeItems.some((codeItem) => codeItem.code === tradeDefault) ? (
                <option value={tradeDefault}>{tradeDefault}</option>
              ) : null}
            </select>
          </label>
          <label>
            <span>Package</span>
            <select name="packageId" key={`package-${packageDefault}`} defaultValue={packageDefault}>
              <option value="">No package</option>
              {packageItems.map((codeItem) => (
                <option key={codeItem.id} value={codeItem.package_id ?? codeItem.code}>
                  {codeItemLabel(codeItem)}
                </option>
              ))}
              {packageDefault &&
              !packageItems.some((codeItem) => (codeItem.package_id ?? codeItem.code) === packageDefault) ? (
                <option value={packageDefault}>{packageDefault}</option>
              ) : null}
            </select>
          </label>
          <label>
            <span>Granularity</span>
            <select name="estimateGranularity" key={`granularity-${granularityDefault}`} defaultValue={granularityDefault}>
              <Options values={ESTIMATE_GRANULARITIES} current={granularityDefault} />
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={item?.status ?? "active"}>
              <option value="active">active</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </label>
        </>
      ) : null}
      {section === "all" || section === "pricing" ? (
        <>
          <label>
            <span>Method</span>
            <select name="costingMethod" key={`method-${methodDefault}`} defaultValue={methodDefault}>
              <Options values={COSTING_METHODS} current={methodDefault} />
            </select>
          </label>
          <label>
            <span>Unit</span>
            <input name="unit" key={`unit-${unitDefault}`} defaultValue={unitDefault} required />
          </label>
          <label>
            <span>Base rate</span>
            <input name="baseRate" type="number" step="0.01" defaultValue={item?.base_rate ?? ""} required />
          </label>
        </>
      ) : null}
      {section === "all" || section === "notes" ? (
        <>
          <label>
            <span>Source label</span>
            <input name="sourceLabel" defaultValue={item?.source_label ?? item?.sources?.[0]?.source_label ?? ""} />
          </label>
          <label>
            <span>Source URL</span>
            <input name="sourceUrl" defaultValue={item?.source_url ?? item?.sources?.[0]?.source_url ?? ""} />
          </label>
          <label>
            <span>Source notes</span>
            <input name="sourceNotes" defaultValue={item?.source_notes ?? item?.sources?.[0]?.notes ?? ""} />
          </label>
          <label className="drawer-field-wide">
            <span>Notes</span>
            <input name="notes" defaultValue={item?.notes ?? ""} />
          </label>
        </>
      ) : null}
    </FieldGrid>
  );
}

function TemplateItemFields({ item, template }: { item?: TemplateItem; template: Template }) {
  return (
    <FieldGrid>
      <input type="hidden" name="masterCostTemplateId" value={template.id} />
      <input type="hidden" name="masterCostItemId" value={item?.master_cost_item_id ?? ""} />
      <input type="hidden" name="masterCodeItemId" value={item?.master_code_item_id ?? ""} />
      <label>
        <span>Title</span>
        <input name="title" defaultValue={item?.title ?? ""} required />
      </label>
      <label>
        <span>Parent item</span>
        <select name="parentItemId" defaultValue={item?.parent_item_id ?? ""}>
          <option value="">No parent</option>
          {template.items
            .filter((candidate) => candidate.id !== item?.id)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.cost_code} - {candidate.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>Code</span>
        <input name="costCode" defaultValue={item?.cost_code ?? ""} required />
      </label>
      <label>
        <span>Trade</span>
        <input name="tradeCode" defaultValue={item?.trade_code ?? ""} />
      </label>
      <label>
        <span>Package</span>
        <input name="packageId" defaultValue={item?.package_id ?? ""} />
      </label>
      <label>
        <span>Granularity</span>
        <select name="estimateGranularity" defaultValue={item?.estimate_granularity ?? "allowance"}>
          <Options values={ESTIMATE_GRANULARITIES} current={item?.estimate_granularity} />
        </select>
      </label>
      <label>
        <span>Method</span>
        <select name="costingMethod" defaultValue={item?.costing_method ?? "rate_per_sqm"}>
          <Options values={COSTING_METHODS} current={item?.costing_method} />
        </select>
      </label>
      <label>
        <span>Unit</span>
        <input name="unit" defaultValue={item?.unit ?? ""} required />
      </label>
      <label>
        <span>Rate</span>
        <input name="baseRate" type="number" step="0.01" defaultValue={item?.base_rate ?? ""} required />
      </label>
      <label>
        <span>Quantity</span>
        <input name="defaultQuantity" type="number" step="0.01" defaultValue={item?.default_quantity ?? ""} />
      </label>
      <label>
        <span>Basis</span>
        <input name="quantityBasis" defaultValue={item?.quantity_basis ?? ""} />
      </label>
      <label>
        <span>Low factor</span>
        <input name="lowFactor" type="number" step="0.01" defaultValue={item?.low_factor ?? ""} />
      </label>
      <label>
        <span>Mid factor</span>
        <input name="midFactor" type="number" step="0.01" defaultValue={item?.mid_factor ?? ""} />
      </label>
      <label>
        <span>High factor</span>
        <input name="highFactor" type="number" step="0.01" defaultValue={item?.high_factor ?? ""} />
      </label>
      <label>
        <span>Contingency %</span>
        <input name="contingencyPercent" type="number" step="0.01" defaultValue={item?.contingency_percent ?? ""} />
      </label>
      <label>
        <span>Sort</span>
        <input name="sortOrder" type="number" step="1" defaultValue={item?.sort_order ?? ""} />
      </label>
      <label className="drawer-field-wide">
        <span>Notes</span>
        <input name="notes" defaultValue={item?.notes ?? ""} />
      </label>
    </FieldGrid>
  );
}

function Drawer({
  state,
  portfolio,
  actions,
  onClose
}: {
  state: DrawerState | null;
  portfolio: FeasibilityPortfolio;
  actions: BaseCostsActions;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("details");
  if (!state) return null;

  const templates = portfolio.masterCostTemplates.filter((template) => template.status !== "archived");
  const template = "templateId" in state ? templates.find((item) => item.id === state.templateId) ?? null : null;
  const codeItem = state.type === "codeItem" ? portfolio.masterCodeItems.find((item) => item.id === state.itemId) ?? null : null;
  const templateItem =
    state.type === "templateItem" && template ? template.items.find((item) => item.id === state.itemId) ?? null : null;
  const databaseMasterItem =
    state.type === "masterItem"
      ? portfolio.masterCostItems.find((item) => item.id === state.itemId) ?? null
      : state.type === "addMasterToTemplate"
        ? portfolio.masterCostItems.find((item) => item.id === state.masterItemId) ?? null
        : null;
  const masterItem = databaseMasterItem ?? templateItem?.sourceItem ?? null;
  const masterUsage = masterItem ? usageForMasterItem(templates, masterItem.id) : [];
  const masterSources = databaseMasterItem?.sources ?? [];
  const masterTargetLinks = databaseMasterItem?.targetLinks ?? [];
  const isMasterDrawer = state.type === "masterItem" || state.type === "newMasterItem";
  const masterTabFields = ["details", "pricing", "source", "links", "usage", "notes"];

  return (
    <aside className="cost-edit-drawer">
      <div className="drawer-header">
        <div>
          <strong>
            {state.type === "newTemplate"
              ? "New Template"
              : state.type === "newMasterItem"
                ? "New Master Item"
                : state.type === "newCodeItem"
                  ? "New Code Item"
                  : state.type === "codeItem"
                    ? codeItem?.title
                    : state.type === "addMasterToTemplate"
                      ? "Add to Template"
                      : state.type === "masterItem"
                        ? masterItem?.title
                        : state.type === "template"
                          ? template?.name
                          : templateItem?.title}
          </strong>
          <div className="muted">
            {codeItem
              ? `${codeItem.code} global ${codeItem.code_type}`
              : masterItem
                ? `${masterItem.cost_code} source rate ${formatCurrency(Number(masterItem.base_rate ?? 0))}`
                : "Focused editor"}
          </div>
        </div>
        <button type="button" onClick={onClose}>
          x
        </button>
      </div>

      <div className="drawer-tabs">
        {(isMasterDrawer ? [...masterTabFields] : ["details", "pricing", "source", "links", "notes"]).map((item) => (
          <button type="button" className={tab === item ? "is-active" : ""} key={item} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {state.type === "newTemplate" ? (
        <form action={actions.createTemplateAction} className="drawer-form">
          <FieldGrid>
            <label>
              <span>Name</span>
              <input name="name" required />
            </label>
            <label>
              <span>Template type</span>
              <input name="templateType" />
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue="active">
                <option value="active">active</option>
                <option value="draft">draft</option>
              </select>
            </label>
            <label className="drawer-field-wide">
              <span>Description</span>
              <input name="description" />
            </label>
          </FieldGrid>
          <button type="submit">Create Template</button>
        </form>
      ) : null}

      {state.type === "template" && template ? (
        <div className="drawer-form">
          <form action={actions.updateTemplateAction} className="drawer-form">
            <input type="hidden" name="templateId" value={template.id} />
            <FieldGrid>
              <label>
                <span>Name</span>
                <input name="name" defaultValue={template.name} required />
              </label>
              <label>
                <span>Type</span>
                <input name="templateType" defaultValue={template.template_type ?? ""} />
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={template.status}>
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label className="drawer-field-wide">
                <span>Description</span>
                <input name="description" defaultValue={template.description ?? ""} />
              </label>
            </FieldGrid>
            <button type="submit">Save Template</button>
          </form>
          <form action={actions.archiveTemplateAction}>
            <input type="hidden" name="templateId" value={template.id} />
            <button className="danger-button" type="submit">
              Archive Template
            </button>
          </form>
        </div>
      ) : null}

      {state.type === "newCodeItem" ? (
        <form action={actions.createMasterCodeItemAction} className="drawer-form">
          <CodeItemFields portfolio={portfolio} />
          <button type="submit">Create Code Item</button>
        </form>
      ) : null}

      {state.type === "codeItem" && codeItem ? (
        <div className="drawer-form">
          <form action={actions.updateMasterCodeItemAction} className="drawer-form" key={codeItem.id}>
            <input type="hidden" name="itemId" value={codeItem.id} />
            <CodeItemFields item={codeItem} portfolio={portfolio} />
            <button type="submit">Save Code Item</button>
          </form>
          <div className="drawer-danger-zone">
            <form action={actions.archiveMasterCodeItemAction}>
              <input type="hidden" name="itemId" value={codeItem.id} />
              <button className="danger-button" type="submit">
                Archive Code Item
              </button>
            </form>
            <form action={actions.deleteMasterCodeItemAction}>
              <input type="hidden" name="itemId" value={codeItem.id} />
              <button className="danger-button" type="submit">
                Delete Unused Code Item
              </button>
            </form>
            <span className="muted">Used global code items are archived instead of deleted.</span>
          </div>
        </div>
      ) : null}

      {state.type === "newMasterItem" ? (
        <form action={actions.createMasterDatabaseItemAction} className="drawer-form">
          <MasterItemFields portfolio={portfolio} />
          <button type="submit">Create Master Item</button>
        </form>
      ) : null}

      {state.type === "masterItem" && masterItem ? (
        <div className="drawer-form">
          {["details", "pricing", "notes"].includes(tab) ? (
            <form action={actions.updateMasterDatabaseItemAction} className="drawer-form">
              <input type="hidden" name="itemId" value={masterItem.id} />
              <MasterItemFields item={masterItem} portfolio={portfolio} />
              <button type="submit">Save Master Item</button>
            </form>
          ) : null}
          {tab === "links" ? (
            <div className="drawer-field-group">
              <strong>Master Target Links</strong>
              {masterTargetLinks.map((link) => (
                <Fragment key={link.id}>
                  <form action={actions.updateMasterDatabaseTargetLinkAction} className="drawer-link-form">
                    <input type="hidden" name="linkId" value={link.id} />
                    <input type="hidden" name="masterCostItemId" value={masterItem.id} />
                    <select name="targetType" defaultValue={link.target_type}>
                      <Options values={TARGET_TYPES} current={link.target_type} />
                    </select>
                    <input name="targetRef" defaultValue={link.target_ref} required />
                    <input name="linkBasis" defaultValue={link.link_basis ?? ""} />
                    <button type="submit">Save</button>
                  </form>
                  <form action={actions.deleteMasterDatabaseTargetLinkAction}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <button className="danger-button" type="submit">
                      Delete Link
                    </button>
                  </form>
                </Fragment>
              ))}
              <form action={actions.createMasterDatabaseTargetLinkAction} className="drawer-link-form">
                <input type="hidden" name="masterCostItemId" value={masterItem.id} />
                <select name="targetType" defaultValue="archicad_element">
                  <Options values={TARGET_TYPES} />
                </select>
                <input name="targetRef" placeholder="GUID, zone key, package id" required />
                <input name="linkBasis" placeholder="Basis" />
                <button type="submit">Add Link</button>
              </form>
            </div>
          ) : null}
          {tab === "source" ? (
            <div className="drawer-field-group">
              <strong>Sources</strong>
              {masterSources.map((source) => (
                <Fragment key={source.id}>
                  <form action={actions.updateMasterDatabaseItemSourceAction} className="drawer-source-form">
                    <input type="hidden" name="sourceId" value={source.id} />
                    <input type="hidden" name="masterCostItemId" value={masterItem.id} />
                    <input name="sourceType" defaultValue={source.source_type} />
                    <input name="sourceLabel" defaultValue={source.source_label} required />
                    <input name="sourceUrl" defaultValue={source.source_url ?? ""} />
                    <input name="sourceDate" type="date" defaultValue={source.source_date ?? ""} />
                    <input name="confidence" defaultValue={source.confidence ?? ""} />
                    <input name="notes" defaultValue={source.notes ?? ""} />
                    <button type="submit">Save Source</button>
                  </form>
                  <form action={actions.deleteMasterDatabaseItemSourceAction}>
                    <input type="hidden" name="sourceId" value={source.id} />
                    <button className="danger-button" type="submit">
                      Delete Source
                    </button>
                  </form>
                </Fragment>
              ))}
              <form action={actions.createMasterDatabaseItemSourceAction} className="drawer-source-form">
                <input type="hidden" name="masterCostItemId" value={masterItem.id} />
                <input name="sourceType" placeholder="benchmark, supplier" />
                <input name="sourceLabel" placeholder="Source label" required />
                <input name="sourceUrl" placeholder="URL" />
                <input name="sourceDate" type="date" />
                <input name="confidence" placeholder="confidence" />
                <input name="notes" placeholder="notes" />
                <button type="submit">Add Source</button>
              </form>
            </div>
          ) : null}
          {tab === "usage" ? (
            <div className="drawer-field-group">
              <strong>Template Usage ({masterUsage.length})</strong>
              {masterUsage.length > 0 ? (
                masterUsage.map(({ template, item }) => (
                  <div className="usage-row" key={item.id}>
                    <strong>{template.name}</strong>
                    <span>
                      {item.cost_code} - {item.title}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">This master item is not used by any template yet.</p>
              )}
            </div>
          ) : null}
          <div className="drawer-danger-zone">
            <form action={actions.archiveMasterDatabaseItemAction}>
              <input type="hidden" name="itemId" value={masterItem.id} />
              <button className="danger-button" type="submit">
                Archive Master Item
              </button>
            </form>
            <form action={actions.deleteMasterDatabaseItemAction}>
              <input type="hidden" name="itemId" value={masterItem.id} />
              <button className="danger-button" type="submit">
                Delete Draft Item
              </button>
            </form>
            <span className="muted">Delete only works for unused draft items. Used items should be archived.</span>
          </div>
        </div>
      ) : null}

      {state.type === "addMasterToTemplate" && masterItem ? (
        <form action={actions.addMasterDatabaseItemToTemplateAction} className="drawer-form">
          <input type="hidden" name="masterCostItemId" value={masterItem.id} />
          <FieldGrid>
            <label>
              <span>Template</span>
              <select name="masterCostTemplateId" required>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Quantity</span>
              <input name="defaultQuantity" type="number" step="0.01" defaultValue="1" />
            </label>
            <label>
              <span>Basis</span>
              <input name="quantityBasis" />
            </label>
            <label>
              <span>Parent item</span>
              <select name="parentItemId" defaultValue="">
                <option value="">No parent</option>
                {templates.flatMap((template) =>
                  template.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {template.name}: {item.cost_code} - {item.title}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="drawer-field-wide">
              <span>Notes</span>
              <input name="notes" defaultValue={masterItem.notes ?? ""} />
            </label>
          </FieldGrid>
          <button type="submit">Add Linked Item</button>
        </form>
      ) : null}

      {state.type === "templateOnlyItem" && template ? (
        <form action={actions.createTemplateOnlyItemAction} className="drawer-form">
          <TemplateItemFields template={template} />
          <button type="submit">Create Template-only Item</button>
        </form>
      ) : null}

      {state.type === "templateItem" && template && templateItem ? (
        <div className="drawer-form">
          {templateItem.sourceItem ? (
            <div className="notice">
              Linked to master source: <strong>{templateItem.sourceItem.title}</strong> at{" "}
              {formatCurrency(Number(templateItem.sourceItem.base_rate ?? 0))}
            </div>
          ) : null}
          <form action={actions.updateTemplateItemAction} className="drawer-form">
            <input type="hidden" name="itemId" value={templateItem.id} />
            <TemplateItemFields item={templateItem} template={template} />
            <button type="submit">Save Template Item</button>
          </form>
          <form action={actions.deleteTemplateItemAction}>
            <input type="hidden" name="itemId" value={templateItem.id} />
            <button className="danger-button" type="submit">
              Delete Template Item
            </button>
          </form>
          <div className="drawer-field-group">
            <strong>Links</strong>
            {templateItem.links.map((link) => (
              <form action={actions.updateTemplateItemLinkAction} className="drawer-link-form" key={link.id}>
                <input type="hidden" name="linkId" value={link.id} />
                <input type="hidden" name="masterCostTemplateItemId" value={templateItem.id} />
                <select name="targetType" defaultValue={link.target_type}>
                  <Options values={TARGET_TYPES} current={link.target_type} />
                </select>
                <input name="targetRef" defaultValue={link.target_ref} required />
                <input name="linkBasis" defaultValue={link.link_basis ?? ""} />
                <button type="submit">Save</button>
              </form>
            ))}
            <form action={actions.createTemplateItemLinkAction} className="drawer-link-form">
              <input type="hidden" name="masterCostTemplateItemId" value={templateItem.id} />
              <select name="targetType" defaultValue="archicad_element">
                <Options values={TARGET_TYPES} />
              </select>
              <input name="targetRef" placeholder="GUID, zone key, package id" required />
              <input name="linkBasis" placeholder="Basis" />
              <button type="submit">Add Link</button>
            </form>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function BaseCostsWorkspace({ portfolio, actions }: { portfolio: FeasibilityPortfolio; actions: BaseCostsActions }) {
  const activeTemplates = portfolio.masterCostTemplates.filter((template) => template.status !== "archived");
  const [mode, setMode] = useState<"master" | "templates" | "catalog">("catalog");
  const [activeTemplateId, setActiveTemplateId] = useState(activeTemplates[0]?.id ?? "");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const masterSummary = useMemo(() => masterItemSummary(portfolio.masterCostItems), [portfolio.masterCostItems]);
  const allTemplateItems = activeTemplates.flatMap((template) => template.items);
  const linkedTemplateItems = allTemplateItems.filter((item) => item.sourceItem || item.links.length > 0);

  return (
    <section className="base-costs-shell">
      <div className="base-costs-main">
        <div className="base-costs-toolbar app-title-panel app-title-panel--compact">
          <div className="app-title-panel__content">
            <p className="eyebrow">Assumptions</p>
            <h2>Base Costs</h2>
            <p className="muted">
              Reusable cost data, rate sources, code structures, and templates that feed scenario feasibility.
              Site-specific evidence stays on the site; active review stays in Project Network.
            </p>
          </div>
          <div className="base-costs-toolbar-actions">
            <button type="button" onClick={() => setDrawer({ type: "newMasterItem" })}>
              + New Master Item
            </button>
            <button type="button" onClick={() => setDrawer({ type: "newCodeItem" })}>
              + New Code Item
            </button>
            <button type="button" onClick={() => setDrawer({ type: "newTemplate" })}>
              + New Template
            </button>
          </div>
        </div>

        <div className="cost-insight-grid">
          <div className="cost-insight-card">
            <strong>Master Items</strong>
            <div>{portfolio.masterCostItems.length}</div>
            <span className="muted">Reusable cost data rows</span>
          </div>
          <div className="cost-insight-card">
            <strong>Unit Rate Total</strong>
            <div>{formatCurrency(masterSummary.total)}</div>
            <span className="muted">Across master item rates</span>
          </div>
          <div className="cost-insight-card">
            <strong>Linked Template Items</strong>
            <div>{linkedTemplateItems.length}</div>
            <span className="muted">Template items with source/link context</span>
          </div>
          <div className="cost-insight-card">
            <strong>Allowance Risk</strong>
            <div>{masterSummary.allowance}</div>
            <span className="muted">Allowance/provisional master items</span>
          </div>
        </div>

        <div className="base-costs-mode-tabs">
          <button type="button" className={mode === "catalog" ? "is-active" : ""} onClick={() => setMode("catalog")}>
            Code Catalogue
          </button>
          <button type="button" className={mode === "master" ? "is-active" : ""} onClick={() => setMode("master")}>
            Master Database
          </button>
          <button type="button" className={mode === "templates" ? "is-active" : ""} onClick={() => setMode("templates")}>
            Templates
          </button>
        </div>

        {mode === "master" ? (
          <MasterDatabaseView
            masterItems={portfolio.masterCostItems}
            templates={activeTemplates}
            onSelect={(item) => setDrawer({ type: "masterItem", itemId: item.id })}
            onAddToTemplate={(item) => setDrawer({ type: "addMasterToTemplate", masterItemId: item.id })}
          />
        ) : mode === "catalog" ? (
          <CodeCatalogView
            items={portfolio.masterCodeItems}
            onSelect={(item) => setDrawer({ type: "codeItem", itemId: item.id })}
            onCreate={() => setDrawer({ type: "newCodeItem" })}
          />
        ) : (
          <TemplateView
            templates={activeTemplates}
            activeTemplateId={activeTemplateId}
            onTemplateSelect={setActiveTemplateId}
            onTemplateEdit={(templateId) => setDrawer({ type: "template", templateId })}
            onAddTemplateOnly={(templateId) => setDrawer({ type: "templateOnlyItem", templateId })}
            onItemSelect={(template, item) => setDrawer({ type: "templateItem", templateId: template.id, itemId: item.id })}
          />
        )}
      </div>
      <Drawer state={drawer} portfolio={portfolio} actions={actions} onClose={() => setDrawer(null)} />
    </section>
  );
}
