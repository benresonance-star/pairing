"use client";

type PlaybookEntry = {
  title: string;
  problem: string;
  why: string;
  risk: string;
  negotiation: string;
  impact: string;
  escape: {
    trigger: string;
    mechanism: string;
    cost: string;
    timing: string;
    lesson: string;
  };
};

type PlaybookStage = {
  stage: string;
  timing: string;
  entries: PlaybookEntry[];
};

const playbookStages: PlaybookStage[] = [
  {
    stage: "Stage 1 - Pre-Contract",
    timing: "Month 0-1",
    entries: [
      {
        title: "Conditional Contract",
        problem: "Without conditions, the deposit is at risk if finance, planning, soil, or feasibility fails before exit.",
        why: "Finance, due diligence, and planning conditions create a legitimate exit while the project is still being tested.",
        risk: "Vendors may prefer unconditional offers or ask for a higher price in exchange for conditions.",
        negotiation: "Trade speed, seriousness, or a slightly sharper price for conditions that protect both parties from a failed deal.",
        impact: "Preserves about $200K of deposit/working capital if the deal does not stack up.",
        escape: {
          trigger: "Finance declined, feasibility fails, council feedback is negative, contamination appears, or vendor finance fails.",
          mechanism: "Exercise the relevant condition in writing before expiry and have the solicitor issue rescission.",
          cost: "Typical sunk diligence cost is about $5-8K, materially less than a forfeited deposit.",
          timing: "Act before condition expiry. Missing the date can make the contract unconditional.",
          lesson: "Diarise every condition expiry date on day one."
        }
      },
      {
        title: "Nomination Clause",
        problem: "Signing personally then transferring to an entity can trigger double duty or poor tax structuring.",
        why: "A nomination clause preserves flexibility to settle in the right company, trust, or SMSF structure.",
        risk: "Some vendors dislike uncertainty about the final purchasing entity.",
        negotiation: "Have the solicitor draft a standard clause and explain it does not change price or settlement date.",
        impact: "Can avoid $30-66K of double stamp duty and supports the correct tax structure.",
        escape: {
          trigger: "The intended entity is not ready or the accountant recommends another structure.",
          mechanism: "Nominate the correct entity before settlement, or settle in the original buyer if needed.",
          cost: "Correct nomination is a small legal cost; incorrect structure can cost tens of thousands.",
          timing: "Nomination usually needs to happen at least 5-10 business days before settlement.",
          lesson: "Set up the development entity early, not in the final settlement week."
        }
      },
      {
        title: "Vendor Due Diligence - Mortgage & Title Search",
        problem: "A mortgage, caveat, easement, order, or rates issue can block vendor finance or reduce development value.",
        why: "Early title/rates checks expose constraints before expensive consultants are engaged.",
        risk: "Title searches show registered issues, not all pending disputes or future notices.",
        negotiation: "Request rates, land tax, title, and Section 32 material as standard solicitor review inputs.",
        impact: "Avoids being locked into a site where vendor finance or the development footprint is not viable.",
        escape: {
          trigger: "Mortgage blocks vendor finance, easement reduces yield, or council orders require major works.",
          mechanism: "Renegotiate, redesign, price the defect, or exit under due diligence conditions.",
          cost: "Searches and review are low cost; post-settlement discovery can become a major legal/project cost.",
          timing: "Order title searches on day one of due diligence.",
          lesson: "Run the cheapest checks before spending on planning or architecture."
        }
      },
      {
        title: "Contract Price Structuring for GST Margin Scheme",
        problem: "Poor contract allocation can reduce GST cost base and increase GST at sale.",
        why: "The purchase price recorded in the contract sets the margin scheme cost base.",
        risk: "ATO scrutiny is increasing and artificial structuring can create compliance risk.",
        negotiation: "Brief solicitor and accountant before exchange to confirm the price structure and margin scheme basis.",
        impact: "Can save $20-50K in GST by preserving the correct cost base.",
        escape: {
          trigger: "The contract was signed with suboptimal price structure or a GST risk is identified.",
          mechanism: "Correct during due diligence, use a deed of variation, or quantify the added GST cost.",
          cost: "A deed may cost $1.5-3K; doing nothing can cost far more in GST.",
          timing: "Resolve before settlement because the cost base is locked at transfer.",
          lesson: "Tax structure should drive contract structure."
        }
      }
    ]
  },
  {
    stage: "Stage 2 - Pre-Permit",
    timing: "Month 1-6",
    entries: [
      {
        title: "SMSF Bridging Loan",
        problem: "Holding and consultant costs arrive before construction finance is available.",
        why: "A compliant SMSF loan can bridge early costs at commercial rates without selling equity.",
        risk: "ATO, related-party, security, and documentation requirements are strict.",
        negotiation: "This is a legal/accounting structuring exercise, not a vendor negotiation.",
        impact: "Provides roughly $150-250K of bridging capital for the DA period.",
        escape: {
          trigger: "Permit is refused, project is sold, or the build strategy changes.",
          mechanism: "Repay the secured SMSF loan from sale or completion proceeds.",
          cost: "Interest, legal setup, and mortgage discharge costs apply.",
          timing: "Repayment should be tied clearly to sale or completion.",
          lesson: "Document the loan and repayment trigger before funds move."
        }
      },
      {
        title: "Pre-Application Council Meeting",
        problem: "A DA lodged cold can lose months if council raises major objections.",
        why: "Pre-app feedback identifies height, setback, parking, and yield concerns before lodgement.",
        risk: "Informal feedback is not binding at formal assessment.",
        negotiation: "Book it, bring planner and preliminary drawings, and ask targeted supportability questions.",
        impact: "Can save 2-4 months of redesign and holding interest.",
        escape: {
          trigger: "Council feedback indicates the 4 townhouse scheme is unlikely.",
          mechanism: "Redesign, sell with planning potential, or exit while conditions remain live.",
          cost: "Early planner/design sunk costs are much lower than a failed DA after settlement.",
          timing: "Complete before the contract goes unconditional.",
          lesson: "Negative pre-app feedback is a cheap exit signal."
        }
      },
      {
        title: "Town Planner Before Architect - Correct Sequence",
        problem: "Architectural drawings prepared before planning advice often need expensive redesign.",
        why: "Planner-led constraints should brief the architect before detailed drawings are produced.",
        risk: "Generic planners may not understand local council preferences.",
        negotiation: "Ask planners for recent comparable approvals and timelines in the same council.",
        impact: "Avoids abortive design fees and months of redesign.",
        escape: {
          trigger: "Planner says the site cannot support a viable scheme.",
          mechanism: "Exit before settlement, redesign to lower yield, or sell with planning potential.",
          cost: "Planner advice is much cheaper than full drawings for a scheme council will not support.",
          timing: "Get planning advice before settlement.",
          lesson: "Planning envelope first, architecture second."
        }
      },
      {
        title: "Environmental & Soil Contamination Assessment",
        problem: "Hidden contamination can make remediation or finance unviable.",
        why: "Phase 1 and, if needed, Phase 2 assessment identifies contamination before ownership transfers.",
        risk: "Clean-looking land can still have legacy contamination.",
        negotiation: "Require access or vendor records for environmental due diligence.",
        impact: "A few thousand dollars of assessment can avoid a $50-500K remediation problem.",
        escape: {
          trigger: "ESA identifies contamination risk or soil sampling confirms contamination.",
          mechanism: "Renegotiate, require vendor remediation, or exit under due diligence.",
          cost: "Assessment costs are modest compared with remediation.",
          timing: "Commission Phase 1 in week one of due diligence.",
          lesson: "Extend due diligence where legacy contamination risk is plausible."
        }
      }
    ]
  },
  {
    stage: "Stage 3 - Pre-Construction",
    timing: "Month 6-10",
    entries: [
      {
        title: "Early Off-Plan Marketing",
        problem: "Waiting until permit grant to market can delay presales and construction finance.",
        why: "Early off-plan contracts with protections can support lender presale requirements.",
        risk: "Buyers may hesitate before permit and sunset clauses need careful drafting.",
        negotiation: "Appoint the selling agent at lodgement and target buyers willing to wait.",
        impact: "10% deposits on two presales can contribute about $250K of capital support.",
        escape: {
          trigger: "Presales fail, permit is refused, or finance is declined.",
          mechanism: "Rescind protected buyer contracts, remarket, or sell the permitted site.",
          cost: "Selling a permitted site has fees but may recover permit uplift.",
          timing: "Decide before drawing construction finance.",
          lesson: "A DA-approved site is a sellable fallback before construction starts."
        }
      },
      {
        title: "Builder Deferred Margin",
        problem: "The equity gap after senior debt, vendor finance, and presales can remain material.",
        why: "A builder may defer part of margin to practical completion to reduce early funding need.",
        risk: "Builders may refuse or inflate price to compensate.",
        negotiation: "Offer programme certainty in exchange for deferred margin paid from settlements.",
        impact: "Can reduce the equity gap by about $100-160K.",
        escape: {
          trigger: "Builder defaults, becomes insolvent, or deferred terms break down.",
          mechanism: "Use contract termination/default rights and replace the builder if required.",
          cost: "Replacement builders can cost materially more, partly offset by insurance where available.",
          timing: "Act formally and quickly on builder default.",
          lesson: "Never pay ahead of independently certified work value."
        }
      },
      {
        title: "Fixed-Price Contract Procurement & Tender Process",
        problem: "A single builder quote gives away pricing and contract leverage.",
        why: "Tendering identical documents to multiple builders creates price tension and better terms.",
        risk: "Tendering requires complete documentation; incomplete scopes produce qualified quotes.",
        negotiation: "Use competitive quotes to negotiate delay damages, latent conditions, and extension terms.",
        impact: "Can save $80-200K on a $2M build and reduce overrun risk.",
        escape: {
          trigger: "Quotes make the project unviable or are too qualified to compare.",
          mechanism: "Value-engineer, retender, stage the build, or sell the permitted site.",
          cost: "Redesign/retender cost is small relative to an overpriced build contract.",
          timing: "Tender during permit assessment, not after approval.",
          lesson: "Never go to construction without comparable quotes."
        }
      },
      {
        title: "Building Permit - Separate from Planning Permit",
        problem: "The planning permit does not authorise construction; building permit delay is often missed.",
        why: "Working drawings, engineering, and private building surveyor review add 4-8 weeks.",
        risk: "NCC or structural issues can force revisions and extra cost.",
        negotiation: "Appoint the building surveyor early and request pre-lodgement review.",
        impact: "Avoids surprise delay and holding interest between planning approval and construction.",
        escape: {
          trigger: "Building permit is refused or engineering identifies costly site conditions.",
          mechanism: "Revise drawings, specify engineering solutions, update feasibility, or sell with permit package.",
          cost: "Revisions and engineered foundations can be material and should be captured in contingency.",
          timing: "Start building permit work as soon as planning permit issues.",
          lesson: "Treat building permit as its own programme milestone."
        }
      }
    ]
  },
  {
    stage: "Stage 4 - Construction",
    timing: "Month 10-20",
    entries: [
      {
        title: "GST Input Tax Credits",
        problem: "GST on construction invoices creates cash drag if credits are not claimed progressively.",
        why: "Quarterly BAS claims can recover GST during construction.",
        risk: "GST registration and supply classification must be correct.",
        negotiation: "This is a compliance process: register before incurring costs and brief the accountant.",
        impact: "Can recover up to about $182K progressively on a $2M build.",
        escape: {
          trigger: "Construction stalls, administration risk appears, or completed stock cannot sell.",
          mechanism: "Sell residual stock, refinance to residual stock debt, or hold/rent stock.",
          cost: "Fire-sale discounts and higher residual debt rates may apply.",
          timing: "Identify distress early while options remain open.",
          lesson: "Contingency and flexible drawdowns matter most during construction."
        }
      },
      {
        title: "Staged Build Completion",
        problem: "All units completing together keeps peak debt outstanding until the last settlement.",
        why: "Early completion of some units lets settlements retire expensive debt earlier.",
        risk: "Builder programme and occupancy permit sequencing may not support staging.",
        negotiation: "Ask whether early handover for the first units can be programmed without price change.",
        impact: "Can save $30-60K in interest across settlements.",
        escape: {
          trigger: "Staging fails, occupancy permits are delayed, or a buyer defaults.",
          mechanism: "Use buyer default rights, builder delay claims, or residual stock refinance.",
          cost: "Holding cost continues until delayed units resolve.",
          timing: "Buyer default notices must follow statutory timing precisely.",
          lesson: "Include strong settlement/default clauses in off-plan contracts."
        }
      },
      {
        title: "5% Builder Retention",
        problem: "Progress claims can drain working capital before settlement.",
        why: "Retention keeps part of each claim as defects/security leverage.",
        risk: "Builders may price for it or resist it.",
        negotiation: "Include standard retention wording in the building contract.",
        impact: "Can keep about $100K of working capital/control through completion.",
        escape: {
          trigger: "Defects appear or builder refuses rectification.",
          mechanism: "Use retention to fund rectification or claim on insurance where available.",
          cost: "Defects above retention may need insurance/legal recovery.",
          timing: "Do not release retention until defects obligations are clear.",
          lesson: "Retention is post-payment leverage; protect it."
        }
      },
      {
        title: "Security of Payment Act - Know Your Obligations",
        problem: "Missing a payment schedule deadline can make a disputed claim payable.",
        why: "The Act creates strict response windows for payment claims.",
        risk: "A claim can become an enforceable debt if ignored.",
        negotiation: "Set service rules, claim wording, and dispute procedures in the contract.",
        impact: "Avoids a disputed claim becoming an unanswerable judgment.",
        escape: {
          trigger: "A payment claim is received or the response window was missed.",
          mechanism: "Engage a construction lawyer and issue payment schedules on time.",
          cost: "Adjudication and missed deadlines can be costly.",
          timing: "Respond within the statutory business-day window.",
          lesson: "Calendar every claim response deadline immediately."
        }
      },
      {
        title: "Variation Management - Controlling Budget Blowout",
        problem: "Uncontrolled variations can add $50-150K to the build.",
        why: "Written variation discipline controls scope, price, and evidence.",
        risk: "Verbal instructions and implied directions become claims.",
        negotiation: "Require written, priced approval before variation work starts.",
        impact: "Can save $30-80K through process discipline.",
        escape: {
          trigger: "A late or disputed variation claim appears.",
          mechanism: "Review against contract scope, use QS valuation, and dispute in the required form.",
          cost: "QS/adjudication costs are much lower than unchecked claims.",
          timing: "Challenge variations when raised, not at practical completion.",
          lesson: "Maintain a live variation register from day one."
        }
      },
      {
        title: "Site Insurance - Contract Works, Public Liability & Workers Compensation",
        problem: "Insurance gaps can leave the principal exposed to site loss, injury, or damage.",
        why: "Contract works, liability, and workers compensation cover different risks.",
        risk: "Builder policies may lapse, exclude you, or fail to name you as interested party.",
        negotiation: "Require certificates of currency before site access and at regular intervals.",
        impact: "Avoids uninsured claims that could exceed the project value.",
        escape: {
          trigger: "An incident occurs and cover is missing or inadequate.",
          mechanism: "Claim if covered, pursue builder obligations, and arrange immediate backstop cover.",
          cost: "Insurance premiums are small compared with uninsured losses.",
          timing: "Verify policies before first site works.",
          lesson: "Insurance is yours to verify, not only the builder's to manage."
        }
      }
    ]
  },
  {
    stage: "Stage 5 - Settlement",
    timing: "Month 18-22",
    entries: [
      {
        title: "Simultaneous Settlement on Presold Units",
        problem: "PC, occupancy permits, buyer finance, and settlement can fall out of sync.",
        why: "Prepared documentation and notice periods allow settlement immediately after occupancy permit.",
        risk: "Buyer finance may expire or buyers may seek extensions.",
        negotiation: "Set contract settlement mechanics and require current buyer finance before the target date.",
        impact: "Each week saved on peak debt can save thousands of dollars in interest.",
        escape: {
          trigger: "Buyers default, market conditions fall, or the lender calls the facility.",
          mechanism: "Issue default notices, relist, refinance residual stock, or rent units.",
          cost: "Discounts and agent fees may apply, partly offset by retained deposits.",
          timing: "Act as soon as settlement risk appears.",
          lesson: "Diversify buyer and lender exposure."
        }
      },
      {
        title: "Plan of Subdivision - Title Registration Timeline",
        problem: "Individual units cannot settle until separate titles are registered.",
        why: "Survey, council certification, authority sign-off, and registration take weeks.",
        risk: "Service authority or Section 173 requirements can add delay.",
        negotiation: "Engage the surveyor early and brief planning permit conditions up front.",
        impact: "Avoids 6-10 weeks of settlement delay and holding cost.",
        escape: {
          trigger: "Certification, services, or agreements delay title registration.",
          mechanism: "Use planner, solicitor, surveyor, and authority liaison in parallel.",
          cost: "Professional fees are small relative to interest delay.",
          timing: "Start subdivision planning at building permit stage.",
          lesson: "Do not wait until occupancy permit to start titles."
        }
      },
      {
        title: "GST Margin Scheme Election - Formal Written Agreement Required",
        problem: "Missing written election can force GST on full sale price.",
        why: "Margin scheme requires written agreement before the taxable supply.",
        risk: "Late or undocumented elections are invalid.",
        negotiation: "Instruct solicitor to include margin scheme clauses in every sale contract.",
        impact: "Can save $150-200K in GST compared with standard method.",
        escape: {
          trigger: "Contracts exchanged without the clause or buyer solicitor objects.",
          mechanism: "Add before exchange, seek deed of variation, or quantify extra GST.",
          cost: "Variation is cheap; missed election can cost tens of thousands per unit.",
          timing: "Election must be made before contract execution.",
          lesson: "Make margin scheme wording non-negotiable in the solicitor brief."
        }
      },
      {
        title: "GST Withholding by Purchasers at Settlement",
        problem: "Purchasers withhold GST at settlement, reducing cash available to retire debt.",
        why: "New residential withholding is remitted to the ATO and released after lodgement/reconciliation.",
        risk: "A lender may expect full repayment before the withheld component is released.",
        negotiation: "Agree a repayment mechanism with the lender that allows a 30-day ATO release tail.",
        impact: "Manages a temporary cash gap of roughly 1/11th of sale price per sold unit.",
        escape: {
          trigger: "ATO release is delayed or lender demands immediate repayment.",
          mechanism: "Escalate with accountant and lender using Form 2 and withholding calculations.",
          cost: "Delay mainly costs short-term interest unless lender terms are inflexible.",
          timing: "Lodge vendor GST forms on settlement day.",
          lesson: "Plan GST withholding with lender, accountant, and solicitor early."
        }
      },
      {
        title: "Land Tax Clearance Certificate",
        problem: "Outstanding land tax can delay settlement or reduce proceeds.",
        why: "SRO clearance confirms what must be paid before title transfer.",
        risk: "Trust structures and vendor arrears can create unexpected liability.",
        negotiation: "Ask for SRO notices and confirm clearance obligations during due diligence.",
        impact: "Avoids settlement delay and inherited/uncosted land tax exposure.",
        escape: {
          trigger: "Clearance reveals vendor debt or conditional payment.",
          mechanism: "Deduct from vendor proceeds, renegotiate, or budget own land tax accrual.",
          cost: "Application cost is small; missed liabilities can be significant.",
          timing: "Apply well before settlement.",
          lesson: "Model land tax from day one."
        }
      },
      {
        title: "Immediate Refinance of Retained Townhouse",
        problem: "Construction debt on a retained unit is expensive after completion.",
        why: "Refinancing into investment debt can halve the holding rate.",
        risk: "Serviceability, valuation, and rental income assumptions may fail.",
        negotiation: "Start refinance approval 60 days before practical completion with a broker.",
        impact: "Can save about $55K over 12 months on retained-townhouse holding costs.",
        escape: {
          trigger: "Refinance fails, market softens, or capital is needed elsewhere.",
          mechanism: "Sell, hold and rent, or refinance later to release equity.",
          cost: "Sale fees and tax consequences must be weighed against holding benefit.",
          timing: "Pre-approve before practical completion.",
          lesson: "The retained townhouse is a long-term wealth lever; sell only with a clear reason."
        }
      }
    ]
  }
];

export function StrategyPlaybook() {
  return (
    <section className="strategy-playbook">
      <div className="strategy-playbook-intro">
        <p>
          Every strategy in this model exists to solve a specific problem. This playbook explains the why behind each
          element: the problem it solves, the risk it carries, and the negotiation required to make it work.
        </p>
      </div>

      {playbookStages.map((stage) => (
        <section className="strategy-playbook-stage" key={stage.stage}>
          <div className="strategy-playbook-stage__heading">
            <span />
            <div>
              <h3>{stage.stage}</h3>
              <p>{stage.timing}</p>
            </div>
          </div>

          <div className="strategy-playbook-card-list">
            {stage.entries.map((entry) => (
              <article className="strategy-playbook-card" key={entry.title}>
                <header>
                  <h4>{entry.title}</h4>
                </header>
                <div className="strategy-playbook-card__body">
                  <div className="strategy-playbook-grid">
                    <div>
                      <strong>The Problem</strong>
                      <p>{entry.problem}</p>
                    </div>
                    <div>
                      <strong>Why This Strategy</strong>
                      <p>{entry.why}</p>
                    </div>
                    <div>
                      <strong>Risk to Manage</strong>
                      <p>{entry.risk}</p>
                    </div>
                    <div>
                      <strong>How to Negotiate It</strong>
                      <p>{entry.negotiation}</p>
                    </div>
                  </div>
                  <div className="strategy-playbook-impact">
                    <strong>Financial Impact:</strong> {entry.impact}
                  </div>
                  <div className="strategy-playbook-escape">
                    <div className="strategy-playbook-escape__title">Escape Strategy - If This Stage Goes Wrong</div>
                    <div className="strategy-playbook-escape__grid">
                      <div>
                        <strong>Exit Trigger</strong>
                        <p>{entry.escape.trigger}</p>
                      </div>
                      <div>
                        <strong>Exit Mechanism</strong>
                        <p>{entry.escape.mechanism}</p>
                      </div>
                      <div>
                        <strong>Cost to Exit</strong>
                        <p>{entry.escape.cost}</p>
                      </div>
                      <div>
                        <strong>Timing - When to Act</strong>
                        <p>{entry.escape.timing}</p>
                      </div>
                    </div>
                    <div className="strategy-playbook-lesson">
                      <strong>Lesson:</strong> {entry.escape.lesson}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
