"use client";

import { useMemo, useState } from "react";
import type { ProjectNetworkData, NetworkProfile } from "../../lib/project-network";

type ProjectNetworkActions = {
  createInquiryAction: (formData: FormData) => Promise<void>;
  createMessageAction: (formData: FormData) => Promise<void>;
  createWorkProductAction: (formData: FormData) => Promise<void>;
  createOrganisationAction: (formData: FormData) => Promise<void>;
  updateOrganisationAction: (formData: FormData) => Promise<void>;
  archiveOrganisationAction: (formData: FormData) => Promise<void>;
  deleteOrganisationAction: (formData: FormData) => Promise<void>;
  createProfileAction: (formData: FormData) => Promise<void>;
  updateProfileAction: (formData: FormData) => Promise<void>;
  archiveProfileAction: (formData: FormData) => Promise<void>;
  deleteProfileAction: (formData: FormData) => Promise<void>;
  upsertCapabilityAction: (formData: FormData) => Promise<void>;
  deleteCapabilityAction: (formData: FormData) => Promise<void>;
  createKnowledgePackAction: (formData: FormData) => Promise<void>;
  updateKnowledgePackAction: (formData: FormData) => Promise<void>;
  archiveKnowledgePackAction: (formData: FormData) => Promise<void>;
  deleteKnowledgePackAction: (formData: FormData) => Promise<void>;
  assignKnowledgePackAction: (formData: FormData) => Promise<void>;
  unassignKnowledgePackAction: (formData: FormData) => Promise<void>;
  upsertAgentCardAction: (formData: FormData) => Promise<void>;
};

type Props = {
  network: ProjectNetworkData;
  actions: ProjectNetworkActions;
};

function listValue(value: unknown[] | undefined): string {
  return Array.isArray(value) ? value.map((item) => String(item)).join(", ") : "Not configured";
}

function listText(value: unknown[] | undefined): string {
  return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
}

function jsonText(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback, null, 2);
}

type DrawerMode = "profile" | "newProfile" | "organisation" | "newOrganisation" | "knowledgePack" | "newKnowledgePack";
type AgentTab = "Profile" | "Capabilities" | "Knowledge" | "Tools" | "Guardrails" | "Outputs" | "Review";

function ProfileCard({ profile, selected, onSelect }: { profile: NetworkProfile; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`network-profile-card ${selected ? "network-profile-card--selected" : ""}`} onClick={onSelect}>
      <span className={`network-profile-avatar network-profile-avatar--${profile.profile_type}`}>
        {profile.profile_type === "agentic" ? "AI" : profile.profile_type === "synthetic" ? "S" : "H"}
      </span>
      <span className="network-profile-card-main">
        <strong>{profile.display_name}</strong>
        <small>{profile.domain}</small>
        <span className="network-chip-row">
          <span className="network-chip">{profile.profile_type}</span>
          <span className="network-chip">{profile.status}</span>
          {profile.contact_details ? <span className="network-chip">contact</span> : null}
          {profile.preferred_llm ? <span className="network-chip">{profile.preferred_llm}</span> : null}
          {profile.agentCard ? <span className="network-chip network-chip--accent">LLM-ready</span> : null}
        </span>
      </span>
    </button>
  );
}

export function ProjectNetworkWorkspace({ network, actions }: Props) {
  const [selectedProfileId, setSelectedProfileId] = useState(network.profiles[0]?.id ?? "");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("profile");
  const [selectedOrganisationId, setSelectedOrganisationId] = useState(network.organisations[0]?.id ?? "");
  const [selectedKnowledgePackId, setSelectedKnowledgePackId] = useState(network.knowledgePacks[0]?.id ?? "");
  const [agentTab, setAgentTab] = useState<AgentTab>("Profile");
  const [showArchivedDirectory, setShowArchivedDirectory] = useState(false);
  const selectedProfile = useMemo(
    () => network.profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [network.profiles, selectedProfileId]
  );
  const selectedOrganisation = useMemo(
    () => network.organisations.find((organisation) => organisation.id === selectedOrganisationId) ?? network.organisations[0] ?? null,
    [network.organisations, selectedOrganisationId]
  );
  const selectedKnowledgePack = useMemo(
    () => network.knowledgePacks.find((pack) => pack.id === selectedKnowledgePackId) ?? network.knowledgePacks[0] ?? null,
    [network.knowledgePacks, selectedKnowledgePackId]
  );
  const selectedOrganisationProfileCount = selectedOrganisation
    ? network.profiles.filter((profile) => profile.organisation_id === selectedOrganisation.id).length
    : 0;
  const selectedProfileInUse = selectedProfile
    ? network.inquiries.some((inquiry) => inquiry.messages.some((message) => message.profile_id === selectedProfile.id)) ||
      network.workProducts.some((product) => product.profile_id === selectedProfile.id) ||
      network.agentSessions.some((session) =>
        session.participants.some((participant) => participant.profile_id === selectedProfile.id) ||
        session.messages.some((message) => message.profile_id === selectedProfile.id) ||
        session.toolCalls.some((toolCall) => toolCall.profile_id === selectedProfile.id) ||
        session.outputs.some((output) => output.profile_id === selectedProfile.id)
      ) ||
      Boolean(selectedProfile.agentCard)
    : false;
  const selectedKnowledgePackAssignmentCount = selectedKnowledgePack
    ? network.profiles.filter((profile) => profile.knowledgePacks.some((pack) => pack.id === selectedKnowledgePack.id)).length
    : 0;
  const visibleOrganisations = showArchivedDirectory
    ? network.organisations
    : network.organisations.filter((organisation) => organisation.status !== "archived");
  const visibleProfilesByCategory = network.profilesByCategory
    .map((group) => ({
      ...group,
      profiles: showArchivedDirectory ? group.profiles : group.profiles.filter((profile) => profile.status !== "archived")
    }))
    .filter((group) => group.profiles.length > 0);
  const hiddenArchivedDirectoryCount =
    network.organisations.filter((organisation) => organisation.status === "archived").length +
    network.profiles.filter((profile) => profile.status === "archived").length;
  const activeSession = network.agentSessions[0] ?? null;

  return (
    <section className="project-network-shell">
      <div className="project-network-hero">
        <div>
          <p className="network-eyebrow">Project Network / Intelligence Directory</p>
          <h2>Human and agentic collaboration layer</h2>
          <p>
            Represent project people, authorities, market voices, and LLM-ready specialist agents with defined knowledge,
            scope, constraints, inquiry threads, and reviewable work products.
          </p>
        </div>
        <form action={actions.createInquiryAction} className="network-hero-form">
          <strong>Ask the network</strong>
          <input name="title" placeholder="Inquiry title" required />
          <textarea name="question" placeholder="What decision, risk, or missing information should the network work through?" required />
          <div className="network-form-grid">
            <input name="linkedRefType" placeholder="Link type e.g. site" />
            <input name="linkedRefId" placeholder="Link id e.g. site-mews-lane" />
          </div>
          <input name="createdBy" placeholder="Created by" defaultValue="Developer Principal" />
          <button type="submit">Create Inquiry</button>
        </form>
      </div>

      <div className="network-stat-grid">
        <article>
          <span>{network.totals.profileCount}</span>
          <strong>Identities</strong>
          <small>human, synthetic, agentic</small>
        </article>
        <article>
          <span>{network.totals.openInquiryCount}</span>
          <strong>Open inquiries</strong>
          <small>questions being worked</small>
        </article>
        <article>
          <span>{network.totals.knowledgePackCount}</span>
          <strong>Knowledge packs</strong>
          <small>scope, constraints, tools</small>
        </article>
        <article>
          <span>{network.totals.agentSessionCount}</span>
          <strong>Agent sessions</strong>
          <small>auditable multi-agent work</small>
        </article>
      </div>

      <div className="project-network-grid">
        <aside className="network-directory-panel">
          <div className="network-panel-header">
            <div>
              <p className="network-eyebrow">Directory</p>
              <h3>Project ecosystem</h3>
            </div>
            <div className="network-chip-row">
              <button type="button" onClick={() => setDrawerMode("newProfile")}>+ Identity</button>
              <button type="button" onClick={() => setDrawerMode("newOrganisation")}>+ Org</button>
              <button type="button" onClick={() => setShowArchivedDirectory((value) => !value)}>
                {showArchivedDirectory ? "Hide Archived" : `Show Archived${hiddenArchivedDirectoryCount ? ` (${hiddenArchivedDirectoryCount})` : ""}`}
              </button>
            </div>
          </div>
          <details open className="network-category">
            <summary>
              <span>Organisations</span>
              <small>{visibleOrganisations.length}</small>
            </summary>
            <div className="network-profile-list">
              {visibleOrganisations.map((organisation) => (
                <button
                  key={organisation.id}
                  type="button"
                  className="network-profile-card"
                  onClick={() => {
                    setSelectedOrganisationId(organisation.id);
                    setDrawerMode("organisation");
                  }}
                >
                  <span className="network-profile-avatar network-profile-avatar--human">O</span>
                  <span className="network-profile-card-main">
                    <strong>{organisation.name}</strong>
                    <small>{organisation.organisation_type}</small>
                    <span className="network-chip-row">
                      <span className="network-chip">{organisation.status}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </details>
          {visibleProfilesByCategory.map((group) => (
            <details key={group.category} open className="network-category">
              <summary>
                <span>{group.category}</span>
                <small>{group.profiles.length}</small>
              </summary>
              <div className="network-profile-list">
                {group.profiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    selected={profile.id === selectedProfile?.id}
                    onSelect={() => {
                      setSelectedProfileId(profile.id);
                      setDrawerMode("profile");
                      setAgentTab("Profile");
                    }}
                  />
                ))}
              </div>
            </details>
          ))}
        </aside>

        <main className="network-command-panel">
          <section className="network-focus-card">
            <div>
              <p className="network-eyebrow">Live Roundtable</p>
              <h3>{activeSession?.title ?? "No active session"}</h3>
              <p>{activeSession?.objective ?? "Create an inquiry to start a governed collaboration session."}</p>
            </div>
            <div className="network-session-participants">
              {activeSession?.participants.map((participant) => (
                <span key={participant.id}>{participant.profile?.display_name ?? participant.profile_id}</span>
              ))}
            </div>
          </section>

          <section className="network-board">
            <div className="network-panel-header">
              <div>
                <p className="network-eyebrow">Inquiries</p>
                <h3>Questions and collaboration threads</h3>
              </div>
            </div>
            <div className="network-inquiry-list">
              {network.inquiries.map((inquiry) => (
                <article key={inquiry.id} className="network-inquiry-card">
                  <div className="network-inquiry-card-header">
                    <div>
                      <span className="network-chip network-chip--accent">{inquiry.status}</span>
                      <h4>{inquiry.title}</h4>
                    </div>
                    <small>{inquiry.linked_ref_type ? `${inquiry.linked_ref_type}: ${inquiry.linked_ref_id}` : "unlinked"}</small>
                  </div>
                  <p>{inquiry.question}</p>
                  <div className="network-message-stack">
                    {inquiry.messages.slice(0, 3).map((message) => (
                      <blockquote key={message.id}>
                        <strong>{message.author_label}</strong>
                        <span>{message.message}</span>
                      </blockquote>
                    ))}
                  </div>
                  <form action={actions.createMessageAction} className="network-inline-form">
                    <input type="hidden" name="inquiryId" value={inquiry.id} />
                    <select name="profileId" defaultValue={selectedProfile?.id ?? ""}>
                      <option value="">Project team</option>
                      {network.profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.display_name}
                        </option>
                      ))}
                    </select>
                    <input name="authorLabel" placeholder="Author" defaultValue={selectedProfile?.display_name ?? "Project team"} />
                    <select name="authorType" defaultValue={selectedProfile?.profile_type ?? "human"}>
                      <option value="human">human</option>
                      <option value="agentic">agentic</option>
                      <option value="synthetic">synthetic</option>
                    </select>
                    <input name="message" placeholder="Add a question, finding, or instruction" required />
                    <button type="submit">Add</button>
                  </form>
                </article>
              ))}
            </div>
          </section>

          <div className="network-lower-grid">
            <section className="network-board">
              <div className="network-panel-header">
                <div>
                  <p className="network-eyebrow">Knowledge</p>
                  <h3>Reusable packs</h3>
                </div>
                <button type="button" onClick={() => setDrawerMode("newKnowledgePack")}>+ Pack</button>
              </div>
              {network.knowledgePacks.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className="network-mini-card network-mini-card-button"
                  onClick={() => {
                    setSelectedKnowledgePackId(pack.id);
                    setDrawerMode("knowledgePack");
                  }}
                >
                  <strong>{pack.title}</strong>
                  <span>{pack.domain}</span>
                  <small>{pack.output_policy}</small>
                </button>
              ))}
            </section>

            <section className="network-board">
              <div className="network-panel-header">
                <div>
                  <p className="network-eyebrow">Outputs</p>
                  <h3>Work products</h3>
                </div>
              </div>
              {network.workProducts.map((product) => (
                <article key={product.id} className="network-mini-card">
                  <div className="network-inquiry-card-header">
                    <strong>{product.title}</strong>
                    <span className="network-chip">{product.status}</span>
                  </div>
                  <span>{product.product_type} by {product.profile?.display_name ?? "Project team"}</span>
                  <small>{product.summary}</small>
                </article>
              ))}
              <form action={actions.createWorkProductAction} className="network-work-product-form">
                <strong>Draft work product</strong>
                <input name="title" placeholder="Title" required />
                <div className="network-form-grid">
                  <select name="productType" defaultValue="brief">
                    <option value="brief">Brief</option>
                    <option value="risk register">Risk register</option>
                    <option value="cost review">Cost review</option>
                    <option value="decision memo">Decision memo</option>
                  </select>
                  <select name="inquiryId" defaultValue={network.inquiries[0]?.id ?? ""}>
                    <option value="">No inquiry</option>
                    {network.inquiries.map((inquiry) => (
                      <option key={inquiry.id} value={inquiry.id}>
                        {inquiry.title}
                      </option>
                    ))}
                  </select>
                </div>
                <select name="profileId" defaultValue={selectedProfile?.id ?? ""}>
                  <option value="">Project team</option>
                  {network.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.display_name}
                    </option>
                  ))}
                </select>
                <textarea name="summary" placeholder="What should this output contain?" />
                <button type="submit">Create Draft</button>
              </form>
            </section>
          </div>
        </main>

        <aside className="network-drawer-panel">
          {drawerMode === "newOrganisation" ? (
            <form action={actions.createOrganisationAction} className="network-drawer-form">
              <p className="network-eyebrow">New Organisation</p>
              <h3>Create organisation</h3>
              <input name="name" placeholder="Organisation name" required />
              <input name="organisationType" placeholder="developer, authority, consultant, builder, agentic" required />
              <textarea name="description" placeholder="Description" />
              <input name="status" defaultValue="active" />
              <button type="submit">Create Organisation</button>
            </form>
          ) : null}

          {drawerMode === "organisation" && selectedOrganisation ? (
            <>
              <form action={actions.updateOrganisationAction} className="network-drawer-form" key={selectedOrganisation.id}>
                <p className="network-eyebrow">Organisation</p>
                <h3>{selectedOrganisation.name}</h3>
                <input type="hidden" name="organisationId" value={selectedOrganisation.id} />
                <input name="name" defaultValue={selectedOrganisation.name} required />
                <input name="organisationType" defaultValue={selectedOrganisation.organisation_type} required />
                <textarea name="description" defaultValue={selectedOrganisation.description ?? ""} />
                <input name="status" defaultValue={selectedOrganisation.status} />
                <button type="submit">Save Organisation</button>
              </form>
              <div className="network-danger-row">
                <form action={actions.archiveOrganisationAction}>
                  <input type="hidden" name="organisationId" value={selectedOrganisation.id} />
                  <button type="submit">Archive</button>
                </form>
                {selectedOrganisationProfileCount === 0 ? (
                  <form action={actions.deleteOrganisationAction}>
                    <input type="hidden" name="organisationId" value={selectedOrganisation.id} />
                    <button type="submit" className="danger-button">Delete</button>
                  </form>
                ) : (
                  <p className="network-guard-note">
                    Assigned to {selectedOrganisationProfileCount} profile{selectedOrganisationProfileCount === 1 ? "" : "s"}.
                    Archive instead of deleting.
                  </p>
                )}
              </div>
            </>
          ) : null}

          {drawerMode === "newProfile" ? (
            <form action={actions.createProfileAction} className="network-drawer-form">
              <p className="network-eyebrow">New Identity</p>
              <h3>Create profile</h3>
              <select name="organisationId" defaultValue="">
                <option value="">No organisation</option>
                {network.organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
                ))}
              </select>
              <input name="displayName" placeholder="Display name" required />
              <select name="profileType" defaultValue="human">
                <option value="human">human</option>
                <option value="synthetic">synthetic</option>
                <option value="agentic">agentic</option>
              </select>
              <input name="category" defaultValue="Developer Team" />
              <input name="domain" placeholder="Domain" required />
              <textarea name="summary" placeholder="Summary" />
              <label>
                Contact details
                <textarea name="contactDetails" placeholder="For human and synthetic profiles: email, phone, company contact, preferred channel" />
              </label>
              <label>
                Preferred LLM
                <input name="preferredLlm" placeholder="For agentic and synthetic profiles: e.g. GPT-5.5, Claude, local model" />
              </label>
              <input name="status" defaultValue="active" />
              <button type="submit">Create Identity</button>
            </form>
          ) : null}

          {drawerMode === "profile" && selectedProfile ? (
            <>
              <div className="network-drawer-top">
                <span className={`network-profile-avatar network-profile-avatar--${selectedProfile.profile_type}`}>
                  {selectedProfile.profile_type === "agentic" ? "AI" : selectedProfile.profile_type === "synthetic" ? "S" : "H"}
                </span>
                <div>
                  <p className="network-eyebrow">Selected Identity</p>
                  <h3>{selectedProfile.display_name}</h3>
                  <span>{selectedProfile.organisation?.name ?? "Independent / synthetic"}</span>
                </div>
              </div>
              {selectedProfile.profile_type === "agentic" ? (
                <div className="network-drawer-tabs">
                  {(["Profile", "Capabilities", "Knowledge", "Tools", "Guardrails", "Outputs", "Review"] as AgentTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={agentTab === tab ? "network-tab-active" : ""}
                      onClick={() => setAgentTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              ) : null}

              {agentTab === "Profile" ? (
                <>
                  <form action={actions.updateProfileAction} className="network-drawer-form" key={`profile-${selectedProfile.id}`}>
                    <input type="hidden" name="profileId" value={selectedProfile.id} />
                    <select name="organisationId" defaultValue={selectedProfile.organisation?.id ?? selectedProfile.organisation_id ?? ""}>
                      <option value="">No organisation</option>
                      {network.organisations.map((organisation) => (
                        <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
                      ))}
                    </select>
                    <input name="displayName" defaultValue={selectedProfile.display_name} required />
                    <select name="profileType" defaultValue={selectedProfile.profile_type}>
                      <option value="human">human</option>
                      <option value="synthetic">synthetic</option>
                      <option value="agentic">agentic</option>
                    </select>
                    <input name="category" defaultValue={selectedProfile.category} />
                    <input name="domain" defaultValue={selectedProfile.domain} required />
                    <textarea name="summary" defaultValue={selectedProfile.summary ?? ""} />
                    {selectedProfile.profile_type === "human" || selectedProfile.profile_type === "synthetic" ? (
                      <label>
                        Contact details
                        <textarea
                          name="contactDetails"
                          defaultValue={selectedProfile.contact_details ?? ""}
                          placeholder="Email, phone, company contact, preferred channel"
                        />
                      </label>
                    ) : (
                      <input type="hidden" name="contactDetails" value={selectedProfile.contact_details ?? ""} />
                    )}
                    {selectedProfile.profile_type === "agentic" || selectedProfile.profile_type === "synthetic" ? (
                      <label>
                        Preferred LLM
                        <input
                          name="preferredLlm"
                          defaultValue={selectedProfile.preferred_llm ?? ""}
                          placeholder="e.g. GPT-5.5, Claude, local model"
                        />
                      </label>
                    ) : (
                      <input type="hidden" name="preferredLlm" value={selectedProfile.preferred_llm ?? ""} />
                    )}
                    <input name="status" defaultValue={selectedProfile.status} />
                  {selectedProfile.organisation_id && !selectedProfile.organisation ? (
                    <p className="network-guard-note">
                      The stored organisation link was not found. Select the correct organisation before saving.
                    </p>
                  ) : null}
                    <button type="submit">Save Profile</button>
                  </form>
                  <div className="network-danger-row">
                    <form action={actions.archiveProfileAction}>
                      <input type="hidden" name="profileId" value={selectedProfile.id} />
                      <button type="submit">Archive</button>
                    </form>
                    <form action={actions.deleteProfileAction}>
                      <input type="hidden" name="profileId" value={selectedProfile.id} />
                      {selectedProfileInUse ? (
                        <p className="network-guard-note">This profile has project activity. Archive instead of deleting.</p>
                      ) : (
                        <button type="submit" className="danger-button">Delete</button>
                      )}
                    </form>
                  </div>
                </>
              ) : null}

              {agentTab === "Capabilities" ? (
                <form action={actions.upsertCapabilityAction} className="network-drawer-form" key={`cap-${selectedProfile.id}`}>
                  <input type="hidden" name="profileId" value={selectedProfile.id} />
                  <strong>Capabilities</strong>
                  <label>Skills<textarea name="skills" defaultValue={listText(selectedProfile.capability?.skills_json)} /></label>
                  <label>Question types<textarea name="questionTypes" defaultValue={listText(selectedProfile.capability?.question_types_json)} /></label>
                  <label>Output types<textarea name="outputTypes" defaultValue={listText(selectedProfile.capability?.output_types_json)} /></label>
                  <label>Base knowledge<textarea name="baseKnowledge" defaultValue={selectedProfile.capability?.base_knowledge ?? ""} /></label>
                  <label>Scope<textarea name="scope" defaultValue={selectedProfile.capability?.scope ?? ""} /></label>
                  <label>Operating instructions Markdown<textarea name="operatingInstructionsMd" defaultValue={selectedProfile.capability?.operating_instructions_md ?? ""} /></label>
                  <label>Structured constraints<textarea name="constraints" defaultValue={listText(selectedProfile.capability?.constraints_json)} /></label>
                  <label>Constraints Markdown<textarea name="constraintsMd" defaultValue={selectedProfile.capability?.constraints_md ?? ""} /></label>
                  <label>Review policy Markdown<textarea name="reviewPolicyMd" defaultValue={selectedProfile.capability?.review_policy_md ?? ""} /></label>
                  <button type="submit">Save Capabilities</button>
                </form>
              ) : null}

              {agentTab === "Knowledge" ? (
                <div className="network-drawer-section">
                  <strong>Knowledge Packs</strong>
                  <div className="network-chip-row">
                    {selectedProfile.knowledgePacks.map((pack) => (
                      <form key={pack.id} action={actions.unassignKnowledgePackAction}>
                        <input type="hidden" name="profileId" value={selectedProfile.id} />
                        <input type="hidden" name="knowledgePackId" value={pack.id} />
                        <button type="submit" className="network-chip">{pack.title} x</button>
                      </form>
                    ))}
                  </div>
                  <form action={actions.assignKnowledgePackAction} className="network-drawer-form">
                    <input type="hidden" name="profileId" value={selectedProfile.id} />
                    <select name="knowledgePackId">
                      {network.knowledgePacks.map((pack) => (
                        <option key={pack.id} value={pack.id}>{pack.title}</option>
                      ))}
                    </select>
                    <button type="submit">Assign Pack</button>
                  </form>
                  <label>Agent memory Markdown<textarea readOnly value={selectedProfile.agentCard?.memory_md ?? "No agent memory configured."} /></label>
                </div>
              ) : null}

              {["Tools", "Guardrails", "Outputs", "Review"].includes(agentTab) ? (
                <form action={actions.upsertAgentCardAction} className="network-drawer-form" key={`agent-${selectedProfile.id}`}>
                  <input type="hidden" name="profileId" value={selectedProfile.id} />
                  <strong>Agent Capability Card</strong>
                  <input name="modelLabel" placeholder="Model label" defaultValue={selectedProfile.agentCard?.model_label ?? "Configurable LLM"} />
                  <input name="status" defaultValue={selectedProfile.agentCard?.status ?? "active"} />
                  <label>Persona Markdown<textarea name="personaMd" defaultValue={selectedProfile.agentCard?.persona_md ?? ""} /></label>
                  <label>Memory Markdown<textarea name="memoryMd" defaultValue={selectedProfile.agentCard?.memory_md ?? ""} /></label>
                  <label>System instructions<textarea name="systemInstructions" defaultValue={selectedProfile.agentCard?.system_instructions ?? ""} /></label>
                  <label>Context policy<textarea name="contextPolicy" defaultValue={selectedProfile.agentCard?.context_policy ?? ""} /></label>
                  <label>Skill policy<textarea name="skillPolicy" defaultValue={listText(selectedProfile.agentCard?.skill_policy_json)} /></label>
                  <label>Tool policy JSON<textarea name="toolPolicy" defaultValue={jsonText(selectedProfile.agentCard?.tool_policy_json, { can_read: ["site_context", "scenario_context"], can_draft: ["inquiry_message", "work_product"], cannot_modify_directly: [] })} /></label>
                  <label>Output schema JSON<textarea name="outputSchema" defaultValue={jsonText(selectedProfile.agentCard?.output_schema_json, { required: ["finding", "evidence_refs", "confidence"] })} /></label>
                  <label>Review policy Markdown<textarea name="reviewPolicyMd" defaultValue={selectedProfile.agentCard?.review_policy_md ?? ""} /></label>
                  <label>Escalation policy Markdown<textarea name="escalationPolicyMd" defaultValue={selectedProfile.agentCard?.escalation_policy_md ?? ""} /></label>
                  <button type="submit">Save Agent Card</button>
                </form>
              ) : null}
            </>
          ) : null}

          {drawerMode === "newKnowledgePack" ? (
            <form action={actions.createKnowledgePackAction} className="network-drawer-form">
              <p className="network-eyebrow">New Knowledge Pack</p>
              <h3>Create pack</h3>
              <input name="title" placeholder="Title" required />
              <input name="domain" placeholder="Domain" required />
              <textarea name="instructions" placeholder="Instructions Markdown" />
              <textarea name="constraints" placeholder="Constraints, one per line" />
              <textarea name="sources" placeholder="Sources, one per line" />
              <textarea name="tools" placeholder="Tools, one per line" />
              <textarea name="outputPolicy" placeholder="Output policy" />
              <input name="status" defaultValue="active" />
              <button type="submit">Create Knowledge Pack</button>
            </form>
          ) : null}

          {drawerMode === "knowledgePack" && selectedKnowledgePack ? (
            <>
              <form action={actions.updateKnowledgePackAction} className="network-drawer-form" key={selectedKnowledgePack.id}>
                <p className="network-eyebrow">Knowledge Pack</p>
                <h3>{selectedKnowledgePack.title}</h3>
                <input type="hidden" name="knowledgePackId" value={selectedKnowledgePack.id} />
                <input name="title" defaultValue={selectedKnowledgePack.title} required />
                <input name="domain" defaultValue={selectedKnowledgePack.domain} required />
                <textarea name="instructions" defaultValue={selectedKnowledgePack.instructions ?? ""} />
                <textarea name="constraints" defaultValue={listText(selectedKnowledgePack.constraints_json)} />
                <textarea name="sources" defaultValue={listText(selectedKnowledgePack.sources_json)} />
                <textarea name="tools" defaultValue={listText(selectedKnowledgePack.tools_json)} />
                <textarea name="outputPolicy" defaultValue={selectedKnowledgePack.output_policy ?? ""} />
                <input name="status" defaultValue={selectedKnowledgePack.status} />
                <button type="submit">Save Knowledge Pack</button>
              </form>
              <div className="network-danger-row">
                <form action={actions.archiveKnowledgePackAction}>
                  <input type="hidden" name="knowledgePackId" value={selectedKnowledgePack.id} />
                  <button type="submit">Archive</button>
                </form>
                <form action={actions.deleteKnowledgePackAction}>
                  <input type="hidden" name="knowledgePackId" value={selectedKnowledgePack.id} />
                  {selectedKnowledgePackAssignmentCount > 0 ? (
                    <p className="network-guard-note">
                      Assigned to {selectedKnowledgePackAssignmentCount} profile{selectedKnowledgePackAssignmentCount === 1 ? "" : "s"}.
                      Archive instead of deleting.
                    </p>
                  ) : (
                    <button type="submit" className="danger-button">Delete</button>
                  )}
                </form>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
