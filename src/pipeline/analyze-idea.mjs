import {
  assertReportReferences,
  validateAnalysisReport,
  validateAnalyzeIdeaRequest,
} from '../domain/schema.mjs';
import { tokenize } from '../retrieval/local-retriever.mjs';

function emptyEvidenceReport(idea, corpus) {
  const conferences = corpus.conferences.join(' and ');
  return validateAnalysisReport({
    ideaProfile: {
      summary: idea,
      topics: tokenize(idea).slice(0, 6),
      population: null,
      method: null,
      mechanisms: [],
    },
    coverageNotice:
      `No direct match was found in the currently indexed ${conferences} corpus. ` +
      'This result does not establish that the idea is globally new or absent from journals, preprints, working papers, or other conferences.',
    closestWork: [],
    innovationPaths: [],
    recommendedNextSteps: [
      'Try a shorter formulation centered on the main constructs and causal relationship.',
      'Search adjacent terminology, theory names, and alternative labels for the population or outcome.',
      'Continue with journal, preprint, and working-paper searches before making a novelty claim.',
    ],
    limitations: [
      'The indexed conference corpus is incomplete relative to the full scholarly literature.',
      'A lack of retrieved evidence can reflect terminology mismatch rather than a genuine research gap.',
    ],
  });
}

function groundClosestWork(report, evidence) {
  const evidenceById = new Map(evidence.map((item) => [item.paper.id, item]));
  const seenPaperIds = new Set();
  const closestWork = [];

  for (const work of report.closestWork) {
    if (seenPaperIds.has(work.paperId)) continue;
    const retrieved = evidenceById.get(work.paperId);
    if (!retrieved) continue;
    seenPaperIds.add(work.paperId);
    closestWork.push({
      ...work,
      title: retrieved.paper.title,
      conference: `${retrieved.paper.conference.name} ${retrieved.paper.conference.year}`,
      evidence: retrieved.evidenceExcerpt,
      sourceUrl: retrieved.paper.sourceUrl,
    });
  }

  return {
    ...report,
    closestWork,
  };
}

export async function analyzeIdea(request, dependencies) {
  const { idea } = validateAnalyzeIdeaRequest(request);
  const { retriever, analyzer, corpus } = dependencies;
  const evidence = await retriever.search({ query: idea, limit: 12 });

  if (evidence.length === 0) {
    return emptyEvidenceReport(idea, corpus);
  }

  const unvalidated = await analyzer.analyze({ idea, evidence, corpus });
  const referencedReport = assertReportReferences(
    validateAnalysisReport(unvalidated),
    evidence.map((item) => item.paper.id),
  );
  return validateAnalysisReport(
    groundClosestWork(referencedReport, evidence),
  );
}
