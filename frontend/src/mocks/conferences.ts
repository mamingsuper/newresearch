export interface Conference {
  id: string;
  name: string;
  acronym: string;
  year: number;
  discipline: string;
  paperCount: number;
  abstractCoverage: number;
  vectorCoverage: number;
  status: "full" | "partial" | "pending";
  provenanceNote: string;
  officialUrl: string;
  lastVerified: string;
}

export const MOCK_CONFERENCES: Conference[] = [
  {
    id: "apsa2026",
    name: "American Political Science Association Annual Meeting",
    acronym: "APSA",
    year: 2026,
    discipline: "Political Science",
    paperCount: 5493,
    abstractCoverage: 5493,
    vectorCoverage: 5493,
    status: "full",
    provenanceNote: "Program sourced from the official APSA 2026 program PDF, verified against the conference archive. All abstracts extracted and validated. No papers fabricated or supplemented.",
    officialUrl: "https://www.apsanet.org/",
    lastVerified: "2026-08-01",
  },
  {
    id: "ica2026",
    name: "International Communication Association Annual Conference",
    acronym: "ICA",
    year: 2026,
    discipline: "Communication Studies",
    paperCount: 3413,
    abstractCoverage: 3413,
    vectorCoverage: 3413,
    status: "full",
    provenanceNote: "Program sourced from the official ICA 2026 conference program. All abstracts verified against the published program. Division metadata preserved.",
    officialUrl: "https://www.icahdq.org/",
    lastVerified: "2026-08-01",
  },
];
