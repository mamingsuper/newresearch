export interface ConversationSummary {
  id: string;
  title: string;
  ideaSnippet: string;
  lang: "en" | "zh";
  createdAt: string;
  paperCount: number;
}

export const MOCK_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "c001",
    title: "Algorithmic curation and political belief formation",
    ideaSnippet: "I'm interested in how algorithmic content curation on social media platforms affects political belief formation and polarization…",
    lang: "en",
    createdAt: "2026-08-20T14:32:00Z",
    paperCount: 8,
  },
  {
    id: "c002",
    title: "社交媒体上的错误信息纠正机制",
    ideaSnippet: "我想研究在不同政治语境下，纠正性信息是否能有效消除社交媒体错误信息对公众信念的影响…",
    lang: "zh",
    createdAt: "2026-08-17T09:11:00Z",
    paperCount: 6,
  },
  {
    id: "c003",
    title: "News avoidance and democratic participation",
    ideaSnippet: "This study examines whether selective news avoidance, the deliberate bypassing of hard news, is associated with lower democratic participation…",
    lang: "en",
    createdAt: "2026-08-14T17:55:00Z",
    paperCount: 7,
  },
  {
    id: "c004",
    title: "Online community grievance amplification",
    ideaSnippet: "My research question concerns how participation in politically homogeneous online communities amplifies feelings of political resentment…",
    lang: "en",
    createdAt: "2026-08-10T11:22:00Z",
    paperCount: 4,
  },
];
