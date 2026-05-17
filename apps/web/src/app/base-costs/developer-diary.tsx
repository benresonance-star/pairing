"use client";

import { useMemo, useState } from "react";

type DiaryPriority = "critical" | "high" | "medium";
type DiaryFilter = "all" | "overdue" | "upcoming" | "critical";

type DiaryItem = {
  id: string;
  month: number;
  stage: string;
  priority: DiaryPriority;
  action: string;
  who: string;
  cost: string;
  riskDelay: string;
  notes: string;
};

const diaryItems: DiaryItem[] = [
  {
    "id": "D-001",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "critical",
    "action": "Order title search & rates certificate",
    "who": "Solicitor",
    "cost": "$80\u2013120",
    "riskDelay": "May sign contract on a title with encumbrances, outstanding orders, or a vendor mortgage that blocks vendor finance. Cannot be undone post-settlement.",
    "notes": "Order before making any offer. Title search takes 24hrs online. Rates certificate from Kingston City Council takes 3\u20135 days."
  },
  {
    "id": "D-002",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "critical",
    "action": "Establish development entity (company or trust)",
    "who": "Accountant + solicitor",
    "cost": "$1,500\u20133,500",
    "riskDelay": "Signing in personal name without a nomination clause triggers double stamp duty ($30\u201366K) when transferring to your development entity later.",
    "notes": "Company setup takes 1\u20132 days. Trust deed takes 3\u20135 days. Must be done before contract exchange if you want to sign in the entity's name directly."
  },
  {
    "id": "D-003",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "critical",
    "action": "Register for GST as development entity",
    "who": "Accountant",
    "cost": "$0 (ATO registration)",
    "riskDelay": "Cannot claim GST input tax credits on any costs incurred before GST registration. On a $2M build at 10% GST content, late registration costs up to $182K in lost credits.",
    "notes": "GST registration is free and takes 24\u201348hrs via MyGov/ATO. Must be registered before incurring any project costs."
  },
  {
    "id": "D-004",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "high",
    "action": "Brief accountant on GST margin scheme election & contract price structure",
    "who": "Accountant",
    "cost": "$500\u20131,500 (advice fee)",
    "riskDelay": "Contract price structure locks in your GST margin scheme cost base. Wrong structure increases GST liability by $20\u201350K. Cannot be changed after exchange without vendor consent.",
    "notes": "The margin scheme election must appear in every contract of sale. Brief your solicitor to include standard margin scheme wording before exchanging any contract."
  },
  {
    "id": "D-005",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "critical",
    "action": "Commission Phase 1 Environmental Site Assessment",
    "who": "Environmental consultant",
    "cost": "$2,000\u20134,000",
    "riskDelay": "Discovering contamination post-settlement means you own the problem. Remediation can cost $50\u2013500K and make the project unfinanceable. Lenders will not advance funds on contaminated land.",
    "notes": "Phase 1 reviews historical land use records. Takes 5\u201310 days. If Phase 1 identifies risk, Phase 2 soil sampling ($8\u201315K, 2\u20133 weeks) is required before proceeding."
  },
  {
    "id": "D-006",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "critical",
    "action": "Negotiate & exchange conditional contract with vendor finance clause",
    "who": "Solicitor + you",
    "cost": "$2,500\u20135,000 (legal fees)",
    "riskDelay": "Going unconditional without vendor finance agreed removes your primary capital gap lever. Losing conditions removes your ability to exit if the project proves unviable.",
    "notes": "Conditions: (1) subject to finance 21 days; (2) subject to DD 45 days; (3) vendor finance terms agreed in writing. Include nomination clause. Include margin scheme election."
  },
  {
    "id": "D-007",
    "month": 0,
    "stage": "Pre-Contract",
    "priority": "high",
    "action": "Apply for land tax clearance certificate (vendor's)",
    "who": "Solicitor",
    "cost": "$50 (SRO application)",
    "riskDelay": "Vendor's outstanding land tax becomes your liability at settlement if not cleared. Can be $15\u201350K+. SRO takes 5\u201310 business days to issue clearance.",
    "notes": "Your solicitor should apply as part of Section 32 review. If vendor has arrears, negotiate price reduction or require clearance before settlement."
  },
  {
    "id": "D-008",
    "month": 1,
    "stage": "Pre-Permit",
    "priority": "critical",
    "action": "Engage town planner (before architect)",
    "who": "You",
    "cost": "$2,500\u20135,000",
    "riskDelay": "Engaging architect first wastes $15\u201325K on drawings that may need redesign after council feedback. Town planner first confirms the permitted envelope before design dollars are spent.",
    "notes": "Request a planner with recent 4-dwelling approvals in Bayside City Council specifically. Ask for examples and approval timelines achieved."
  },
  {
    "id": "D-009",
    "month": 1,
    "stage": "Pre-Permit",
    "priority": "critical",
    "action": "Obtain SMSF specialist advice if using SMSF bridging",
    "who": "SMSF accountant + solicitor",
    "cost": "$3,000\u20135,000",
    "riskDelay": "SMSF lending to a related entity without proper documentation breaches ATO rules. Penalties can include fund deregistration and income tax on the entire fund balance.",
    "notes": "Loan must be at arm's-length commercial rates, properly documented, and secured by registered mortgage. Do not proceed without specialist written advice."
  },
  {
    "id": "D-010",
    "month": 2,
    "stage": "Pre-Permit",
    "priority": "critical",
    "action": "Book pre-application meeting with Bayside City Council",
    "who": "Town planner + you",
    "cost": "$500\u20131,500 (council fee)",
    "riskDelay": "Without pre-app feedback, DA lodgement is a gamble. A failed or objected DA adds 3\u20136 months to the timeline. At $22K/month interest, that is $66\u2013132K of preventable cost.",
    "notes": "Bring preliminary scheme drawings. Ask specifically about: dwelling height, setbacks, car parking ratio, party wall fire separation, and any heritage or vegetation overlays on title."
  },
  {
    "id": "D-011",
    "month": 2,
    "stage": "Pre-Permit",
    "priority": "high",
    "action": "Commission geotechnical (soil) report",
    "who": "Geotechnical engineer",
    "cost": "$2,000\u20135,000",
    "riskDelay": "Unknown soil conditions (rock, high water table, reactive clay, soft fill) can require engineered foundations adding $30\u2013120K to construction cost. Discovering this after a fixed-price contract is signed creates a latent conditions dispute.",
    "notes": "A geotech report is also required by your building surveyor before a building permit is issued. Get it early so it informs both the structural design and the construction tender."
  },
  {
    "id": "D-012",
    "month": 3,
    "stage": "Pre-Permit",
    "priority": "high",
    "action": "Lodge planning permit application (DA) with Bayside Council",
    "who": "Town planner",
    "cost": "$8,000\u201320,000 (town planner fees + council lodgement fee ~$3,000)",
    "riskDelay": "Every month of delay in lodging pushes the entire project timeline out by one month. 22 months interest at $22K/month \u2014 delay is pure cost.",
    "notes": "Confirm with town planner that all required plans, shadow diagrams, and traffic assessments are included. Incomplete applications are returned, adding weeks."
  },
  {
    "id": "D-013",
    "month": 3,
    "stage": "Pre-Permit",
    "priority": "high",
    "action": "Commission architect for working drawings (after pre-app feedback)",
    "who": "Architect",
    "cost": "$20,000\u201340,000",
    "riskDelay": "Starting working drawings before the planning permit risks redesign if council requires changes to the approved scheme. Engage architect after pre-app feedback, not before.",
    "notes": "Request architect experience with multi-dwelling Bayside projects. Working drawings must satisfy both planning permit conditions and NCC compliance for the building permit."
  },
  {
    "id": "D-014",
    "month": 3,
    "stage": "Pre-Permit",
    "priority": "medium",
    "action": "Arrange construction insurance (Contract Works + Public Liability)",
    "who": "Insurance broker (construction specialist)",
    "cost": "$3,000\u20138,000 (annual premium)",
    "riskDelay": "An uninsured incident during construction \u2014 fire, structural failure, third-party injury \u2014 can result in a claim exceeding the entire project value. Insurance must be in place before first day of site works.",
    "notes": "Must cover: (1) Contract Works (building under construction); (2) Public Liability minimum $10M; (3) Workers Compensation for all workers on site. Request certificates of currency naming your entity as interested party."
  },
  {
    "id": "D-015",
    "month": 5,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Appoint selling agent \u2014 begin off-plan marketing",
    "who": "You + selling agent",
    "cost": "2% commission on sold units (or negotiated flat fee for off-market)",
    "riskDelay": "Waiting until permit grant to appoint agent adds 3\u20136 months of marketing time. Non-bank lenders require presales to activate construction finance. Every month without presales is a month of delay.",
    "notes": "Brief agent at DA lodgement, not at DA approval. Prepare renders and marketing materials during permit assessment period. Target owner-occupier buyers willing to wait 12\u201318 months."
  },
  {
    "id": "D-016",
    "month": 5,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Confirm margin scheme election clause in all off-plan contracts",
    "who": "Solicitor",
    "cost": "Included in contract preparation fee",
    "riskDelay": "Missing the margin scheme election in a contract of sale means you must use the standard GST method for that sale \u2014 costing ~$40\u201350K extra GST per unit.",
    "notes": "The election must be in writing, agreed by the buyer, and appear in the contract before exchange. Cannot be added retrospectively without buyer consent via deed of variation."
  },
  {
    "id": "D-017",
    "month": 6,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Engage private building surveyor (PBS) \u2014 pre-lodgement review",
    "who": "PBS + architect",
    "cost": "$3,000\u20138,000 (building permit fee)",
    "riskDelay": "The building permit process takes 4\u20138 weeks and is invisible in most feasibility models. Missing it causes a surprise delay at the construction start \u2014 at $22K/month that is $22\u201344K of unbudgeted interest.",
    "notes": "Engage PBS the week planning permit issues. Commission a pre-lodgement NCC compliance review ($500\u20131,000) before formal lodgement to catch issues early. Building permit is separate from planning permit."
  },
  {
    "id": "D-018",
    "month": 6,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Commence tender process \u2014 approach 2\u20133 builders simultaneously",
    "who": "You + QS",
    "cost": "$2,000\u20134,000 (QS tender management)",
    "riskDelay": "A single quote gives the builder all negotiating power and typically runs 10\u201320% above a competitively tendered price. On a $2M build, that is $200\u2013400K left on the table.",
    "notes": "Provide identical documentation to all tenderers: architect's drawings, specification, geotech report, planning permit. Request HIA or MBA fixed-price lump sum contracts. Tender period: 3\u20134 weeks."
  },
  {
    "id": "D-019",
    "month": 6,
    "stage": "Pre-Construction",
    "priority": "high",
    "action": "Engage surveyor for Plan of Subdivision preparation",
    "who": "Licensed surveyor",
    "cost": "$5,000\u201310,000",
    "riskDelay": "Plan of Subdivision registration takes 6\u201312 weeks after occupancy permit is issued. Engaging surveyor at this stage (rather than at PC) gives 12+ months to prepare the plan \u2014 eliminating settlement delay.",
    "notes": "Surveyor needs planning permit conditions, engineering plans, and service authority requirements. The plan must be certified by council and all service authorities before Land Use Victoria registration."
  },
  {
    "id": "D-020",
    "month": 7,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Execute building contract \u2014 negotiate key clauses",
    "who": "Solicitor + you",
    "cost": "$1,500\u20133,000 (legal review of contract)",
    "riskDelay": "Signing a standard builder contract without negotiating key clauses exposes you to: uncapped extensions of time, unlimited latent conditions claims, no delay damages, and unlimited variation claims.",
    "notes": "Key clauses to negotiate: (1) extension of time limited to genuine force majeure only; (2) delay damages $500/day beyond programme; (3) latent conditions shared 50/50 above $10K; (4) all variations in writing before commencement; (5) 5% retention clause."
  },
  {
    "id": "D-021",
    "month": 7,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Brief solicitor on Security of Payment Act obligations",
    "who": "Solicitor",
    "cost": "$500\u20131,000 (briefing fee)",
    "riskDelay": "A payment claim under the Act that is not responded to within 15 business days becomes automatically payable \u2014 regardless of whether the work was done or the price was agreed. One missed response can cost $50\u2013150K.",
    "notes": "Set up a dedicated email address for all contract correspondence. Set calendar alerts for 10 business days after every scheduled progress claim date. Designate who is responsible for reviewing payment claims."
  },
  {
    "id": "D-022",
    "month": 8,
    "stage": "Pre-Construction",
    "priority": "critical",
    "action": "Finalise senior construction finance facility",
    "who": "Finance broker + lender",
    "cost": "$5,000\u201315,000 (establishment fee, legal)",
    "riskDelay": "Commencing construction without an approved finance facility means funding progress claims from cash \u2014 which exhausts your working capital within 2\u20133 claims. Construction halts without finance.",
    "notes": "Provide lender: feasibility study, planning permit, building permit, signed building contract, QS cost plan, 2 executed presale contracts. Negotiate: interest capitalisation, staged drawdown against milestones, 30-day tail for ATO GST withholding release."
  },
  {
    "id": "D-023",
    "month": 8,
    "stage": "Pre-Construction",
    "priority": "high",
    "action": "Negotiate vendor finance deed \u2014 register second mortgage",
    "who": "Solicitor + vendor's solicitor",
    "cost": "$2,000\u20134,000 (legal fees, mortgage registration ~$500)",
    "riskDelay": "Unregistered vendor finance has no security \u2014 if the vendor dies, divorces, or becomes bankrupt, the deferred amount becomes a disputed debt rather than a secured claim.",
    "notes": "Deed must specify: deferred amount, interest rate, repayment trigger (sale settlement proceeds), registered second mortgage on title, priority relative to senior lender."
  },
  {
    "id": "D-024",
    "month": 10,
    "stage": "Construction",
    "priority": "critical",
    "action": "Confirm all site insurance certificates of currency before first site access",
    "who": "Insurance broker + you",
    "cost": "Included in annual premium (see D-014)",
    "riskDelay": "An uninsured incident on day one of construction creates full personal liability. Do not grant site access to the builder until all three certificates are in hand.",
    "notes": "Request: (1) Contract Works naming your entity as interested party; (2) Public Liability $10M+; (3) Workers Compensation covering all workers and subcontractors. Diarise quarterly renewal checks."
  },
  {
    "id": "D-025",
    "month": 10,
    "stage": "Construction",
    "priority": "critical",
    "action": "Set up variation register \u2014 brief builder on written-instruction-only policy",
    "who": "You + builder",
    "cost": "$0 (process discipline only)",
    "riskDelay": "Verbal instructions that are not confirmed in writing become the builder's word against yours. Disputed variation claims at practical completion on a project this size average $50\u2013150K.",
    "notes": "Send written confirmation within 24hrs of any site discussion. Keep a dated register of all variations with agreed prices. Review with QS monthly. Never say \"yes\" verbally without following up in writing."
  },
  {
    "id": "D-026",
    "month": 10,
    "stage": "Construction",
    "priority": "high",
    "action": "Engage QS for monthly progress claim certification",
    "who": "Quantity surveyor",
    "cost": "$500\u20131,000 per inspection",
    "riskDelay": "Paying builder claims without independent certification means you may pay for work not yet completed or work done incorrectly. Overpayment reduces your leverage if disputes arise later.",
    "notes": "QS inspects site before each progress claim payment is authorised. QS also certifies variation claims. Total cost for 6\u20138 inspections: $4,000\u20138,000. Well worth it on a $2M contract."
  },
  {
    "id": "D-027",
    "month": 10,
    "stage": "Construction",
    "priority": "high",
    "action": "Lodge GST BAS quarterly \u2014 claim input tax credits progressively",
    "who": "Accountant",
    "cost": "Included in accounting fees",
    "riskDelay": "Deferring input tax credit claims to the end of the project means you're funding $182K of GST out of pocket during construction instead of recovering it quarterly. This increases your peak debt requirement.",
    "notes": "On a $2M build at 10% GST content, quarterly BAS lodgement recovers ~$45K per quarter. Your accountant must ensure credits are claimed on taxable (not input-taxed) supplies only."
  },
  {
    "id": "D-028",
    "month": 14,
    "stage": "Construction",
    "priority": "high",
    "action": "Monitor construction programme \u2014 check extension of time clauses",
    "who": "You + builder + solicitor if delayed",
    "cost": "$0 (monitoring); $2,000\u20135,000 if dispute arises",
    "riskDelay": "An extension of time granted without scrutiny delays the entire programme and adds interest cost. Builders sometimes claim EOT for events they caused or could have mitigated.",
    "notes": "Review builder's programme monthly. Any EOT claim must reference a specific contract clause and demonstrate the event was beyond the builder's control. Engage your solicitor before accepting any EOT that exceeds 2 weeks."
  },
  {
    "id": "D-029",
    "month": 16,
    "stage": "Construction",
    "priority": "high",
    "action": "Begin pre-approval for investment loan on retained townhouse",
    "who": "Mortgage broker",
    "cost": "$0 (pre-approval is free)",
    "riskDelay": "Without pre-approval in place, refinancing the retained TH after PC takes 4\u20136 weeks \u2014 during which you're paying construction finance rates (10\u201312%) instead of investment rates (6\u20136.5%). Cost: ~$4,500 per month of delay.",
    "notes": "Provide broker: projected rental income, construction contract showing PC date, your income documentation. Target lenders who accept rental income in serviceability. Pre-approval valid for 3\u20136 months \u2014 time it to overlap with PC."
  },
  {
    "id": "D-030",
    "month": 17,
    "stage": "Construction",
    "priority": "critical",
    "action": "Notify lender of GST withholding at settlement \u2014 request 30-day tail",
    "who": "Finance broker + lender",
    "cost": "$0 (negotiation only)",
    "riskDelay": "Lender demands full facility repayment at settlement day but purchasers have withheld 1/11th of each purchase price (~$113K/unit) directly to the ATO. Shortfall of ~$340K on 3 settlements can trigger a facility default.",
    "notes": "Purchaser withholding is mandatory under the Treasury Laws Amendment Act. Lodge Form 2 with ATO on settlement day. ATO typically releases withheld amounts in 14\u201330 days. Negotiate a 30-day repayment tail with lender before the facility is drawn."
  },
  {
    "id": "D-031",
    "month": 18,
    "stage": "Settlement",
    "priority": "critical",
    "action": "Lodge Plan of Subdivision with Land Use Victoria",
    "who": "Surveyor",
    "cost": "$500\u20131,500 (lodgement fees)",
    "riskDelay": "Plan of Subdivision registration takes 6\u201312 weeks. Without registered titles, individual units cannot settle. Each week of delay costs ~$5,500 in interest on residual debt.",
    "notes": "Surveyor should be ready to lodge the day the occupancy permit issues \u2014 not to begin preparation at that point. All service authority certifications should be pre-arranged during construction."
  },
  {
    "id": "D-032",
    "month": 18,
    "stage": "Settlement",
    "priority": "critical",
    "action": "Issue 30-day settlement notices to presale buyers",
    "who": "Solicitor",
    "cost": "Included in conveyancing fee",
    "riskDelay": "Failing to issue valid notices in the correct form means settlement cannot be called. Buyers who are not ready cannot be placed in default. Every week of notice delay = $7,200 interest on $3.75M.",
    "notes": "Notice must comply with Sale of Land Act 1962 (Vic). Include \"time is of the essence\" clause. Send simultaneously to all buyers on the day OC issues and titles are registered."
  },
  {
    "id": "D-033",
    "month": 18,
    "stage": "Settlement",
    "priority": "critical",
    "action": "Apply for land tax clearance certificate for settlement",
    "who": "Solicitor",
    "cost": "$50 (SRO application)",
    "riskDelay": "Settlement cannot proceed without land tax clearance. SRO takes 5\u201310 business days. If land tax is outstanding, settlement is delayed until cleared.",
    "notes": "Apply 20 business days before target settlement date. Your solicitor should include this on their settlement checklist \u2014 confirm it is not being left until the last week."
  },
  {
    "id": "D-034",
    "month": 19,
    "stage": "Settlement",
    "priority": "critical",
    "action": "Lodge GST Form 2 (vendor side of withholding) on each settlement day",
    "who": "Accountant",
    "cost": "Included in accounting fees",
    "riskDelay": "Delaying Form 2 lodgement delays ATO release of withheld funds by the same number of days. On ~$340K withheld across 3 settlements, each day of delay costs ~$93 in interest.",
    "notes": "Pre-prepare the Form 2 for each settlement so it can be lodged same-day. ATO Business Portal or Tax Agent Portal. Release typically takes 14\u201330 days after lodgement."
  },
  {
    "id": "D-035",
    "month": 19,
    "stage": "Settlement",
    "priority": "critical",
    "action": "Arrange simultaneous settlement with all presale buyers",
    "who": "Solicitor",
    "cost": "Included in conveyancing fee",
    "riskDelay": "Settlement delays on presold units cost ~$7,200/week in interest on $3.75M of revenue. Uncoordinated settlements mean debt continues to accrue on the full facility.",
    "notes": "Coordinate with buyers' solicitors 2 weeks before settlement date. Confirm buyers' finance is current. Pre-prepare all transfer of land documents, discharge of mortgage, release of vendor finance, and plan of subdivision registration."
  },
  {
    "id": "D-036",
    "month": 19,
    "stage": "Settlement",
    "priority": "high",
    "action": "Retire mezzanine debt first from settlement proceeds",
    "who": "Finance broker + solicitor",
    "cost": "$0 (sequencing decision)",
    "riskDelay": "Mezzanine is the most expensive debt (14\u201318% p.a.). Every week it continues costs $2,000\u20133,500 in interest. Retiring it last instead of first wastes $8\u201314K on a 4-week miscalculation.",
    "notes": "Sequence of debt retirement: (1) mezzanine in full from settlement 1; (2) vendor finance from settlement 2; (3) senior debt from settlement 3; (4) net profit to you. Brief your solicitor on this waterfall before settlement day."
  },
  {
    "id": "D-037",
    "month": 20,
    "stage": "Settlement",
    "priority": "critical",
    "action": "Refinance retained townhouse to investment loan \u2014 activate pre-approval",
    "who": "Mortgage broker + lender",
    "cost": "$1,500\u20133,500 (establishment fees, valuation)",
    "riskDelay": "Each month on construction finance at 10% instead of investment rate at 6.5% costs ~$4,500 extra on a $500K retained asset. 3 months of delay = $13,500 in preventable interest.",
    "notes": "Activate pre-approval (obtained at D-029) the day construction finance is discharged. Have a tenant lined up \u2014 rental income from day one strengthens refinance serviceability and reduces net holding cost."
  },
  {
    "id": "D-038",
    "month": 21,
    "stage": "Settlement",
    "priority": "high",
    "action": "Release 5% builder retention for unchallenged defects",
    "who": "You + builder",
    "cost": "$0 \u2014 this is money you release TO the builder",
    "riskDelay": "Releasing retention before the defects liability period ends removes your only leverage for rectification. Standard retention period is 12 months from practical completion.",
    "notes": "Conduct a formal defects inspection at month 10 of the DLP (2 months before retention release). Any unresolved defects should be in writing before retention is released. Do not release under pressure before the period ends."
  },
  {
    "id": "D-039",
    "month": 22,
    "stage": "Post-Completion",
    "priority": "high",
    "action": "File end-of-project GST return and confirm ATO releases",
    "who": "Accountant",
    "cost": "Included in accounting fees",
    "riskDelay": "Outstanding GST obligations from the project can trigger ATO interest and penalties. Withheld amounts not released by ATO within 60 days should be followed up directly.",
    "notes": "Your accountant should prepare a comprehensive GST reconciliation for the project: all input tax credits claimed, margin scheme GST on each sale, net GST position. Keep all project records for 5 years minimum for ATO purposes."
  },
  {
    "id": "D-040",
    "month": 22,
    "stage": "Post-Completion",
    "priority": "medium",
    "action": "Commission professional valuation of retained townhouse",
    "who": "Registered valuer",
    "cost": "$500\u2013800",
    "riskDelay": "Without a current valuation, you cannot accurately assess refinancing LVR, calculate capital growth, or plan your next project using retained equity as a capital source.",
    "notes": "An independent valuation (not a bank valuation) gives you the most accurate picture of the asset's value and supporting evidence for future investment decisions."
  }
];

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function daysBetween(left: Date, right: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const end = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((end - start) / dayMs);
}

function priorityLabel(priority: DiaryPriority): string {
  return priority === "critical" ? "Critical" : priority === "high" ? "High" : "Medium";
}

function filterLabel(filter: DiaryFilter): string {
  if (filter === "all") return "All";
  if (filter === "critical") return "Critical Only";
  return filter === "overdue" ? "Overdue" : "Upcoming";
}

export function DeveloperDiary() {
  const [startDate, setStartDate] = useState("2026-05-10");
  const [filter, setFilter] = useState<DiaryFilter>("all");

  const today = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(`${startDate}T00:00:00`), [startDate]);
  const enriched = useMemo(
    () =>
      diaryItems.map((item) => {
        const dueDate = addMonths(start, item.month);
        const daysUntilDue = daysBetween(today, dueDate);
        const status = daysUntilDue < 0 ? "overdue" : daysUntilDue <= 30 ? "upcoming" : "future";
        return { ...item, dueDate, daysUntilDue, status };
      }),
    [start, today]
  );

  const visibleItems = enriched.filter((item) => {
    if (filter === "all") return true;
    if (filter === "overdue") return item.status === "overdue";
    if (filter === "upcoming") return item.status === "upcoming" || item.status === "overdue";
    return item.priority === "critical";
  });

  const groupedItems = visibleItems.reduce<Record<string, typeof visibleItems>>((groups, item) => {
    groups[item.stage] = [...(groups[item.stage] ?? []), item];
    return groups;
  }, {});

  const stages = [...new Set(diaryItems.map((item) => item.stage))];
  const overdue = enriched.filter((item) => item.status === "overdue").length;
  const dueSoon = enriched.filter((item) => item.status === "upcoming").length;
  const critical = enriched.filter((item) => item.priority === "critical").length;

  return (
    <section className="developer-diary">
      <div className="developer-diary-toolbar">
        <label>
          <span>Project Start Date</span>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <p>Set your contract exchange date to generate a live action calendar by project month.</p>
        <div className="developer-diary-filters" aria-label="Developer diary filters">
          {(["all", "overdue", "upcoming", "critical"] as DiaryFilter[]).map((item) => (
            <button type="button" className={filter === item ? "is-active" : ""} key={item} onClick={() => setFilter(item)}>
              {filterLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="developer-diary-summary">
        <span><strong>{diaryItems.length}</strong>Total Actions</span>
        <span><strong>{overdue}</strong>Overdue</span>
        <span><strong>{dueSoon}</strong>Due in 30 Days</span>
        <span><strong>{critical}</strong>Critical Items</span>
      </div>

      <div className="developer-diary-timeline">
        {stages.map((stage) => {
          const items = groupedItems[stage] ?? [];
          if (items.length === 0) return null;
          return (
            <section className="developer-diary-stage" key={stage}>
              <header>
                <h3>{stage}</h3>
                <span>{items.length} actions</span>
              </header>
              <div className="developer-diary-action-list">
                {items.map((item) => (
                  <article className="developer-diary-action" key={item.id}>
                    <div className="developer-diary-date">
                      <strong>{item.id}</strong>
                      <span>Month {item.month}</span>
                      <span>{formatDate(item.dueDate)}</span>
                      <em>{item.daysUntilDue < 0 ? `${Math.abs(item.daysUntilDue)} days overdue` : item.daysUntilDue === 0 ? "Due today" : `Due in ${item.daysUntilDue} days`}</em>
                    </div>
                    <div className="developer-diary-action__body">
                      <div className="developer-diary-action__head">
                        <div>
                          <h4>{item.action}</h4>
                          <p>Who: {item.who} / Cost: {item.cost}</p>
                        </div>
                        <span className={`developer-diary-priority developer-diary-priority--${item.priority}`}>{priorityLabel(item.priority)}</span>
                      </div>
                      <p>{item.notes}</p>
                      <div className="developer-diary-risk"><strong>Risk if delayed:</strong> {item.riskDelay}</div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
