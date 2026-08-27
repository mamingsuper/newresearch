export interface Paper {
  id: string;
  rank: number;
  authorYear: string;
  title: string;
  authors: string;
  conference: "APSA 2026" | "ICA 2026" | "EPSS 2026";
  division?: string;
  keywords?: string[];
  rrfScore: number;
  abstract: string;
  sourceUrl: string;
}

export const MOCK_PAPERS: Paper[] = [
  {
    id: "p001",
    rank: 1,
    authorYear: "Chen & Watkins, 2026",
    title: "Algorithmic Framing and Political Polarization: Evidence from Social Media Exposure Experiments",
    authors: "Mei-Ling Chen, David Watkins, Priya Nair",
    conference: "ICA 2026",
    division: "Political Communication",
    keywords: ["algorithmic curation", "framing", "polarization", "experiment"],
    rrfScore: 0.847,
    abstract: "This paper examines how algorithmic content curation on social media platforms shapes political framing effects and contributes to affective polarization. Drawing on two pre-registered survey experiments (N = 2,840) conducted across three national contexts, we find that exposure to algorithmically curated political content significantly increases partisan affect and reduces cross-partisan empathy. Effects are moderated by prior political knowledge and news consumption habits. We discuss implications for regulatory approaches to platform design and the role of framing in structuring political cognition under conditions of information abundance.",
    sourceUrl: "https://www.icahdq.org/",
  },
  {
    id: "p002",
    rank: 2,
    authorYear: "Okonkwo et al., 2026",
    title: "Agenda-Setting in the Platform Age: How News Feeds Shape Public Priorities",
    authors: "Adaeze Okonkwo, James Liu, Sofia Hernández-Reyes",
    conference: "ICA 2026",
    division: "Mass Communication",
    keywords: ["agenda-setting", "platform media", "public opinion"],
    rrfScore: 0.791,
    abstract: "Agenda-setting theory was developed in an era of mass broadcasting. This paper revisits the theory's mechanisms in the context of algorithmically personalized news feeds. Using a field experiment combined with panel survey data from four countries (N = 6,122), we find evidence for both attribute agenda-setting and second-level effects, but document significant heterogeneity by platform type and user engagement patterns. Algorithmic personalization appears to fragment the public agenda, with implications for democratic deliberation and collective problem recognition.",
    sourceUrl: "https://www.icahdq.org/",
  },
  {
    id: "p003",
    rank: 3,
    authorYear: "Martínez-Vallecillo & Park, 2026",
    title: "Electoral Misinformation and Corrective Effects: A Cross-National Meta-Analysis",
    authors: "Rodrigo Martínez-Vallecillo, Seoyeon Park",
    conference: "APSA 2026",
    division: "Political Psychology",
    keywords: ["misinformation", "correction", "inoculation", "meta-analysis"],
    rrfScore: 0.764,
    abstract: "We present a pre-registered meta-analysis of 87 experimental studies on electoral misinformation correction across 23 countries (total N = 142,600). Our analysis finds that factual corrections reduce belief in misinformation by a mean effect of d = 0.31, but the decay of correction effects is rapid, averaging 72% belief regression within three weeks. Inoculation approaches show more durable effects. We find significant moderation by prior partisan identity, media literacy, and the partisan valence of the misinformation. Findings have implications for platform intervention design and public information campaigns.",
    sourceUrl: "https://www.apsanet.org/",
  },
  {
    id: "p004",
    rank: 4,
    authorYear: "Tanaka & Breckenridge, 2026",
    title: "Networked Grievance: How Online Communities Amplify Political Resentment",
    authors: "Yuki Tanaka, Colin Breckenridge, Fatima Al-Khalidi",
    conference: "APSA 2026",
    division: "Comparative Politics",
    keywords: ["online communities", "political resentment", "network effects", "grievance"],
    rrfScore: 0.739,
    abstract: "Drawing on a novel dataset combining Reddit discussion threads with panel survey data (N = 4,320), this paper examines how online community participation shapes political grievance. We develop a theory of networked grievance amplification, arguing that online communities provide not only information but identity-relevant frameworks that intensify feelings of relative deprivation. We find that consistent community participation over six months significantly increases expressed political resentment, controlling for initial grievance levels and offline social networks. Effects are strongest for users who become high-status contributors within communities.",
    sourceUrl: "https://www.apsanet.org/",
  },
  {
    id: "p005",
    rank: 5,
    authorYear: "Whitfield & Osei-Acheampong, 2026",
    title: "Digital Disinformation and Voter Suppression: Evidence from African Electoral Contexts",
    authors: "Lindsay Whitfield, Kwame Osei-Acheampong",
    conference: "APSA 2026",
    division: "African Politics",
    keywords: ["disinformation", "voter suppression", "Africa", "elections"],
    rrfScore: 0.712,
    abstract: "This paper examines the relationship between targeted digital disinformation campaigns and voting behavior in recent African elections. Using original survey data combined with social media archives from elections in Ghana, Kenya, and Senegal (combined N = 8,900), we find that exposure to disinformation content targeted at ethnic minorities is associated with a 6-12 percentage point reduction in turnout intention. The mechanism operates primarily through confusion about voting procedures rather than changes in candidate preference. We discuss implications for election administration and platform accountability in contexts with limited regulatory capacity.",
    sourceUrl: "https://www.apsanet.org/",
  },
  {
    id: "p006",
    rank: 6,
    authorYear: "Rossetti & Nielsen, 2026",
    title: "The Credibility Paradox: Why Source Cues Fail Under Algorithmic Distribution",
    authors: "Giulia Rossetti, Rasmus Kleis Nielsen",
    conference: "ICA 2026",
    division: "Journalism Studies",
    keywords: ["source credibility", "algorithmic news", "trust", "journalism"],
    rrfScore: 0.698,
    abstract: "Traditional models of source credibility assume that audiences receive content with clear source attribution. This assumption is undermined by social media distribution, where content often circulates without clear source labels and is filtered through algorithmic intermediaries. We present a series of three experiments (total N = 3,240) demonstrating that source credibility cues are significantly less effective at guiding belief formation when content is encountered in algorithmic feed contexts compared to direct publication contexts. We propose a revised credibility model for the platform era.",
    sourceUrl: "https://www.icahdq.org/",
  },
  {
    id: "p007",
    rank: 7,
    authorYear: "Huang & Strömbäck, 2026",
    title: "News Avoidance and Political Disengagement: Longitudinal Evidence from Six Democracies",
    authors: "Yi-Lin Huang, Jesper Strömbäck, Anna Boulianne",
    conference: "ICA 2026",
    division: "Political Communication",
    keywords: ["news avoidance", "political engagement", "media use", "longitudinal"],
    rrfScore: 0.676,
    abstract: "News avoidance has increased substantially across established democracies over the past decade. This paper uses a six-wave longitudinal panel study (N = 12,400) across six countries to examine the relationship between news avoidance and political disengagement. We find that news avoidance is both a cause and consequence of political disengagement, with effects mediated by political interest and news satisfaction. Selective avoiders, who avoid hard news but consume political entertainment, show different trajectories from total avoiders. Findings challenge unidimensional accounts of news avoidance and suggest targeted rather than general interventions.",
    sourceUrl: "https://www.icahdq.org/",
  },
  {
    id: "p008",
    rank: 8,
    authorYear: "Sato & Graber, 2026",
    title: "Visual Frames and Emotional Response: A Neuropolitical Approach to Campaign Advertising",
    authors: "Hiroshi Sato, Maria Graber, Thomas Enomoto",
    conference: "APSA 2026",
    division: "Political Communication",
    keywords: ["visual framing", "emotion", "advertising", "neuropolitics"],
    rrfScore: 0.654,
    abstract: "We apply neuropolitical methods to the study of campaign advertising, combining fMRI data with behavioral measures to examine how visual frames elicit differential emotional responses. A sample of 180 participants viewed 64 campaign advertisements while neural activity was recorded. We find that fear-evoking visual frames activate amygdala responses that are associated with increased vote intention change, while enthusiasm-inducing frames produce more durable attitudinal effects. Partisan identity moderates neural responses to in-group versus out-group candidate advertising. Findings connect neuroscientific and communication approaches to political persuasion.",
    sourceUrl: "https://www.apsanet.org/",
  },
];

export const EXAMPLE_IDEA = `I'm interested in how algorithmic content curation on social media platforms affects political belief formation and polarization. Specifically, I want to understand whether exposure to algorithmically selected political content creates distinct framing effects compared to user-selected content, and whether these effects differ by prior political knowledge. My working hypothesis is that algorithmic curation reduces epistemic diversity by amplifying emotionally resonant but factually partial content.`;
