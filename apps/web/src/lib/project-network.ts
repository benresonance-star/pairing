import type {
  NetworkAgentCardRecord,
  NetworkAgentMessageRecord,
  NetworkAgentOutputRecord,
  NetworkAgentSessionParticipantRecord,
  NetworkAgentSessionRecord,
  NetworkAgentToolCallRecord,
  NetworkInquiryMessageRecord,
  NetworkInquiryRecord,
  NetworkKnowledgePackRecord,
  NetworkOrganisationRecord,
  NetworkProfileCapabilityRecord,
  NetworkProfileKnowledgePackRecord,
  NetworkProfileRecord,
  NetworkWorkProductLinkRecord,
  NetworkWorkProductRecord,
  RuntimeState
} from "./runtime-state";

export type NetworkProfile = NetworkProfileRecord & {
  organisation: NetworkOrganisationRecord | null;
  capability: NetworkProfileCapabilityRecord | null;
  knowledgePacks: NetworkKnowledgePackRecord[];
  agentCard: NetworkAgentCardRecord | null;
  openQuestionCount: number;
};

export type NetworkInquiry = NetworkInquiryRecord & {
  messages: NetworkInquiryMessageRecord[];
  assignedProfiles: NetworkProfileRecord[];
};

export type NetworkWorkProduct = NetworkWorkProductRecord & {
  profile: NetworkProfileRecord | null;
  inquiry: NetworkInquiryRecord | null;
  links: NetworkWorkProductLinkRecord[];
};

export type NetworkAgentSession = NetworkAgentSessionRecord & {
  participants: Array<NetworkAgentSessionParticipantRecord & { profile: NetworkProfileRecord | null }>;
  messages: NetworkAgentMessageRecord[];
  toolCalls: NetworkAgentToolCallRecord[];
  outputs: NetworkAgentOutputRecord[];
};

export type ProjectNetworkData = {
  projectName: string;
  organisations: NetworkOrganisationRecord[];
  profiles: NetworkProfile[];
  profilesByCategory: Array<{ category: string; profiles: NetworkProfile[] }>;
  knowledgePacks: NetworkKnowledgePackRecord[];
  inquiries: NetworkInquiry[];
  workProducts: NetworkWorkProduct[];
  agentSessions: NetworkAgentSession[];
  totals: {
    profileCount: number;
    organisationCount: number;
    knowledgePackCount: number;
    openInquiryCount: number;
    agentSessionCount: number;
    workProductCount: number;
  };
};

const CATEGORY_ORDER = [
  "Developer Team",
  "Authorities",
  "Consultants",
  "Delivery & Construction",
  "Commercial / Finance / Legal",
  "Market / Community",
  "Agentic Assistants"
];

function sortByLabel<T>(items: T[], label: (item: T) => string): T[] {
  return [...items].sort((left, right) => label(left).localeCompare(label(right)));
}

export function buildProjectNetworkData(state: RuntimeState): ProjectNetworkData {
  const organisationsById = new Map(state.network_organisations.map((item) => [item.id, item]));
  const profilesById = new Map(state.network_profiles.map((item) => [item.id, item]));
  const inquiriesById = new Map(state.network_inquiries.map((item) => [item.id, item]));
  const knowledgePacksById = new Map(state.network_knowledge_packs.map((item) => [item.id, item]));
  const profileCapabilitiesByProfile = new Map(
    state.network_profile_capabilities.map((item) => [item.profile_id, item])
  );
  const agentCardsByProfile = new Map(state.network_agent_cards.map((item) => [item.profile_id, item]));
  const profileKnowledgePacks = new Map<string, NetworkKnowledgePackRecord[]>();

  for (const link of state.network_profile_knowledge_packs) {
    const pack = knowledgePacksById.get(link.knowledge_pack_id);
    if (!pack) continue;
    const existing = profileKnowledgePacks.get(link.profile_id) ?? [];
    existing.push(pack);
    profileKnowledgePacks.set(link.profile_id, existing);
  }

  const profiles = sortByLabel(
    state.network_profiles.map((profile) => ({
      ...profile,
      organisation: profile.organisation_id ? organisationsById.get(profile.organisation_id) ?? null : null,
      capability: profileCapabilitiesByProfile.get(profile.id) ?? null,
      knowledgePacks: sortByLabel(profileKnowledgePacks.get(profile.id) ?? [], (item) => item.title),
      agentCard: agentCardsByProfile.get(profile.id) ?? null,
      openQuestionCount: state.network_inquiries.filter((inquiry) =>
        inquiry.status !== "closed" &&
        state.network_inquiry_messages.some((message) => message.inquiry_id === inquiry.id && message.profile_id === profile.id)
      ).length
    })),
    (item) => item.display_name
  );

  const categories = new Map<string, NetworkProfile[]>();
  for (const profile of profiles) {
    const category = profile.category || "Other";
    categories.set(category, [...(categories.get(category) ?? []), profile]);
  }

  const profilesByCategory = [...categories.entries()]
    .map(([category, categoryProfiles]) => ({ category, profiles: categoryProfiles }))
    .sort((left, right) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left.category);
      const rightIndex = CATEGORY_ORDER.indexOf(right.category);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : 99) - (rightIndex >= 0 ? rightIndex : 99);
      }
      return left.category.localeCompare(right.category);
    });

  const inquiries = sortByLabel(
    state.network_inquiries.map((inquiry) => {
      const messages = state.network_inquiry_messages.filter((message) => message.inquiry_id === inquiry.id);
      return {
        ...inquiry,
        messages,
        assignedProfiles: messages
          .map((message) => (message.profile_id ? profilesById.get(message.profile_id) ?? null : null))
          .filter((profile): profile is NetworkProfileRecord => profile !== null)
      };
    }),
    (item) => item.created_at ?? item.title
  ).reverse();

  const workProducts = sortByLabel(
    state.network_work_products.map((product) => ({
      ...product,
      profile: product.profile_id ? profilesById.get(product.profile_id) ?? null : null,
      inquiry: product.inquiry_id ? inquiriesById.get(product.inquiry_id) ?? null : null,
      links: state.network_work_product_links.filter((link) => link.work_product_id === product.id)
    })),
    (item) => item.created_at ?? item.title
  ).reverse();

  const agentSessions = sortByLabel(
    state.network_agent_sessions.map((session) => ({
      ...session,
      participants: state.network_agent_session_participants
        .filter((participant) => participant.session_id === session.id)
        .map((participant) => ({
          ...participant,
          profile: profilesById.get(participant.profile_id) ?? null
        })),
      messages: state.network_agent_messages.filter((message) => message.session_id === session.id),
      toolCalls: state.network_agent_tool_calls.filter((toolCall) => toolCall.session_id === session.id),
      outputs: state.network_agent_outputs.filter((output) => output.session_id === session.id)
    })),
    (item) => item.created_at ?? item.title
  ).reverse();

  return {
    projectName: state.project.name,
    organisations: sortByLabel(state.network_organisations, (item) => item.name),
    profiles,
    profilesByCategory,
    knowledgePacks: sortByLabel(state.network_knowledge_packs, (item) => item.title),
    inquiries,
    workProducts,
    agentSessions,
    totals: {
      profileCount: state.network_profiles.length,
      organisationCount: state.network_organisations.length,
      knowledgePackCount: state.network_knowledge_packs.length,
      openInquiryCount: state.network_inquiries.filter((item) => item.status !== "closed").length,
      agentSessionCount: state.network_agent_sessions.length,
      workProductCount: state.network_work_products.length
    }
  };
}
