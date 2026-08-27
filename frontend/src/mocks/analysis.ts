import { MOCK_PAPERS } from "./papers";

export interface AnalysisReport {
  id: string;
  idea: string;
  createdAt: string;
  ideaProfile: string;
  corpusNotice: string;
  closestWork: string;
  innovationDirections: InnovationDirection[];
  nextSteps: string[];
  limitations: string[];
  papers: typeof MOCK_PAPERS;
}

export interface InnovationDirection {
  title: string;
  body: string;
  citations: { paperId: string; label: string }[];
}

export const MOCK_REPORT: AnalysisReport = {
  id: "r001",
  idea: "",
  createdAt: new Date().toISOString(),
  ideaProfile: "Your research idea centers on the mechanisms by which algorithmic content curation shapes political belief formation and polarization, with particular attention to framing effects and the moderating role of prior political knowledge. This is a theoretically rich inquiry that sits at the intersection of political communication, media psychology, and platform studies. The core theoretical tension between user agency and algorithmic determinism in political information environments is one of the most contested questions in contemporary political communication research.",
  corpusNotice: "This analysis draws exclusively on 10,230 papers indexed from APSA 2026 (5,493), ICA 2026 (3,413), and EPSS 2026 (1,324). Results reflect these three conference corpora and should not be interpreted as a comprehensive review of the global literature. No claim of novelty is made beyond this indexed corpus.",
  closestWork: "The most directly relevant work in this corpus is Chen & Watkins (2026), who examine algorithmic framing effects and political polarization through survey experiments, and Okonkwo et al. (2026), who revisit agenda-setting theory through the lens of algorithmic news feeds. These papers occupy the center of your research space and should be read as essential context. Rossetti & Nielsen (2026) extend this into source credibility dynamics under algorithmic distribution, a complementary angle that speaks to the epistemic mechanisms you hypothesize.",
  innovationDirections: [
    {
      title: "Cross-platform variation in algorithmic framing effects",
      body: "While Chen & Watkins (2026) establish framing effects in algorithmically curated contexts, their design does not systematically vary the platform architecture producing the curation. A study comparing framing effects across platforms with meaningfully different recommendation logics (interest-graph vs. social-graph vs. engagement-optimized) could advance the field substantially. This design would clarify whether observed effects are attributable to 'algorithmic curation' as a general phenomenon or to specific platform design choices.",
      citations: [
        { paperId: "p001", label: "Chen & Watkins, 2026" },
        { paperId: "p006", label: "Rossetti & Nielsen, 2026" },
      ],
    },
    {
      title: "Longitudinal decay of algorithmic framing effects",
      body: "Existing experimental work measures framing effects at single timepoints. Martínez-Vallecillo & Park's (2026) meta-analysis documents rapid decay of correction effects for misinformation. This raises a parallel question for algorithmic framing: are framing effects similarly short-lived, or do they cumulate through repeated exposure? A longitudinal design tracking belief change over sustained platform exposure would fill a meaningful gap.",
      citations: [
        { paperId: "p003", label: "Martínez-Vallecillo & Park, 2026" },
        { paperId: "p007", label: "Huang & Strömbäck, 2026" },
      ],
    },
    {
      title: "Political knowledge as a moderator: heterogeneous effects",
      body: "Your hypothesis about prior political knowledge as a moderator is well-grounded. Chen & Watkins (2026) find moderation by prior political knowledge, but this finding is not yet theorized with precision. Is knowledge acting as a corrective resource, an identity anchor, or a heuristic filter? Distinguishing these mechanisms would advance the theoretical account of who is most susceptible to algorithmic framing and under what conditions.",
      citations: [
        { paperId: "p001", label: "Chen & Watkins, 2026" },
        { paperId: "p008", label: "Sato & Graber, 2026" },
      ],
    },
  ],
  nextSteps: [
    "Read Chen & Watkins (2026) and Okonkwo et al. (2026) as foundational context for your specific question.",
    "Clarify whether your core mechanism is attitudinal (belief change) or epistemic (information selection). These require different dependent variables and designs.",
    "Review Rossetti & Nielsen (2026) for the source credibility angle, which may inform how you theorize the role of perceived accuracy under algorithmic curation.",
    "Consider pre-registration for experimental components given the replication pressures in political communication research, as illustrated by Martínez-Vallecillo & Park's (2026) meta-analytic findings on effect sizes.",
    "Decide whether your comparison condition is 'user-selected content' or 'chronological feed'. These are meaningfully different control conditions with different theoretical implications.",
  ],
  limitations: [
    "This analysis is limited to papers presented at APSA 2026, ICA 2026, and EPSS 2026. Relevant work in political psychology, sociology, and computer science journals is not captured.",
    "Papers are ranked by hybrid RRF retrieval score, which reflects textual and semantic similarity to your input idea. Retrieval rank does not indicate methodological quality or theoretical importance.",
    "The analysis cannot assess the publication status, peer review, or replication record of any cited paper.",
    "Conclusions about innovation directions reflect patterns in the indexed corpus only and do not constitute a claim that proposed directions are unexplored in the broader literature.",
  ],
  papers: MOCK_PAPERS,
};
