import { tokenize } from '../retrieval/local-retriever.mjs';
import { validateAnalysisReport } from '../domain/schema.mjs';

const METHOD_PATTERNS = [
  ['experiment', /\b(experiment|experimental|randomized|randomised)\b/i],
  ['survey', /\b(survey|questionnaire)\b/i],
  ['interviews', /\b(interview|interviews)\b/i],
  ['computational analysis', /\b(computational|machine learning|text analysis)\b/i],
  ['content analysis', /\bcontent analysis\b/i],
];

const POPULATION_PATTERNS = [
  ['young adults', /\byoung adults?\b/i],
  ['adolescents', /\b(adolescent|adolescents|teenagers?)\b/i],
  ['students', /\b(college|university)?\s*students?\b/i],
  ['voters', /\bvoters?\b/i],
];

function detect(patterns, text) {
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function inferMechanisms(idea) {
  const mechanisms = [];
  const moderation = idea.match(/([\p{L}\p{N} -]{2,50})\s+(?:moderates?|as a moderator|as a boundary condition)/iu);
  if (moderation?.[1]) mechanisms.push(moderation[1].trim());
  if (/\b(moderat|boundary condition)/i.test(idea) && /ai literacy/i.test(idea)) {
    mechanisms.push('AI literacy as a moderator');
  }
  if (/\b(mediat|mechanism)/i.test(idea)) mechanisms.push('proposed mediating mechanism');
  return [...new Set(mechanisms)];
}

function overlapDimensions(result, idea) {
  const dimensions = [];
  const joined = `${result.paper.title} ${result.paper.abstract} ${(result.paper.keywords ?? []).join(' ')}`;
  if (result.overlapTerms.some((term) => ['experiment', 'survey', 'interview', 'computational'].includes(term))) {
    dimensions.push('method');
  }
  if (/young adults?|students?|voters?|adolescents?/i.test(idea) && /young adults?|students?|voters?|adolescents?/i.test(joined)) {
    dimensions.push('population');
  }
  if (/literacy|moderator|mechanism|mediator/i.test(idea) && /literacy|moderator|mechanism|mediator/i.test(joined)) {
    dimensions.push('mechanism');
  }
  if (result.overlapTerms.length > 0) dimensions.unshift('topic');
  return [...new Set(dimensions)].slice(0, 4);
}

function topTopics(idea, evidence) {
  const methodWords = new Set(['experiment', 'experimental', 'survey', 'interviews', 'online']);
  const populationWords = new Set(['young', 'adults', 'students', 'voters']);
  const evidenceTerms = evidence.flatMap((item) => item.overlapTerms);
  const preferred = evidenceTerms.filter(
    (term) => !methodWords.has(term) && !populationWords.has(term),
  );
  const fallback = tokenize(idea).filter(
    (term) => !methodWords.has(term) && !populationWords.has(term),
  );
  return [...new Set([...preferred, ...fallback])].slice(0, 6);
}

export class MockIdeaAnalyzer {
  async analyze({ idea, evidence, corpus }) {
    const method = detect(METHOD_PATTERNS, idea);
    const population = detect(POPULATION_PATTERNS, idea);
    const mechanisms = inferMechanisms(idea);
    const evidenceIds = evidence.map((item) => item.paper.id);
    const conferenceLabel = corpus.conferences.join(' and ');

    const report = {
      ideaProfile: {
        summary: idea.trim(),
        topics: topTopics(idea, evidence),
        population,
        method,
        mechanisms,
      },
      coverageNotice:
        `This analysis covers ${corpus.paperCount} records from the currently indexed ${conferenceLabel} corpus. ` +
        'It does not establish that an idea is globally new or absent from journals, preprints, or other conferences.',
      closestWork: evidence.slice(0, 5).map((result, index) => ({
        paperId: result.paper.id,
        title: result.paper.title,
        conference: `${result.paper.conference.name} ${result.paper.conference.year}`,
        relationship: index === 0 ? 'Closest corpus match' : 'Adjacent evidence',
        overlapDimensions: overlapDimensions(result, idea),
        evidence: result.evidenceExcerpt,
        sourceUrl: result.paper.sourceUrl,
      })),
      innovationPaths: [
        {
          title: 'Make the boundary condition explicit',
          rationale:
            mechanisms.length > 0
              ? `Treat ${mechanisms[0]} as a clearly theorized moderator or mechanism, then specify the expected direction and competing explanation.`
              : 'The retrieved abstracts overlap on topic more than on mechanism. A clearly theorized moderator, mediator, or boundary condition could distinguish the design.',
          evidencePaperIds: evidenceIds.slice(0, 2),
          kind: 'inference',
        },
        {
          title: 'Differentiate the identification strategy',
          rationale:
            method
              ? `Compare the proposed ${method} with the designs used by the closest papers and state which causal ambiguity your design resolves.`
              : 'The idea does not yet name an identification strategy. Compare survey, experimental, longitudinal, and behavioral-data options against the closest papers.',
          evidencePaperIds: evidenceIds.slice(0, 3),
          kind: 'inference',
        },
        {
          title: 'Define the contribution as a combination, not a new topic',
          rationale:
            'Frame the contribution around the specific combination of construct, population, mechanism, and method that is not directly represented in the retrieved evidence, rather than claiming the broad topic is untouched.',
          evidencePaperIds: evidenceIds.slice(0, 3),
          kind: 'inference',
        },
      ],
      recommendedNextSteps: [
        'Read the closest abstracts and original program records before revising the contribution claim.',
        'Search journals, preprint servers, and working-paper repositories using the extracted topic and mechanism terms.',
        'Write a one-paragraph design comparison that states what each close paper does and what your design changes.',
      ],
      limitations: [
        'Mock mode uses a small demonstration corpus rather than the complete ICA and APSA datasets.',
        'Conference abstracts may describe preliminary work and do not provide every theoretical or methodological detail.',
        'Similarity is evidence for relatedness, not proof that two research projects are identical.',
      ],
    };

    return validateAnalysisReport(report);
  }
}
