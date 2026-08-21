export class ValidationError extends Error {
  constructor(message, path = '') {
    super(path ? `${path}: ${message}` : message);
    this.name = 'ValidationError';
    this.path = path;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, path) {
  if (!isRecord(value)) throw new ValidationError('must be an object', path);
  return value;
}

function requireString(value, path, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
  if (typeof value !== 'string') throw new ValidationError('must be a string', path);
  const normalized = value.trim();
  if (normalized.length < min) {
    throw new ValidationError(`must be at least ${min} characters`, path);
  }
  if (normalized.length > max) {
    throw new ValidationError(`must be at most ${max} characters`, path);
  }
  return normalized;
}

function nullableString(value, path) {
  if (value === null || value === undefined || value === '') return null;
  return requireString(value, path);
}

function requireStringArray(value, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw new ValidationError('must be an array', path);
  const result = value.map((item, index) => requireString(item, `${path}[${index}]`));
  if (!allowEmpty && result.length === 0) throw new ValidationError('must not be empty', path);
  return result;
}

function requireHttpUrl(value, path) {
  const candidate = requireString(value, path);
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ValidationError('must be a valid URL', path);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ValidationError('must use http or https', path);
  }
  return parsed.toString();
}

export function validatePaperRecord(value) {
  const paper = requireRecord(value, 'paper');
  const conference = requireRecord(paper.conference, 'paper.conference');
  if (!Number.isInteger(conference.year) || conference.year < 1900 || conference.year > 2200) {
    throw new ValidationError('must be a valid year', 'paper.conference.year');
  }
  if (!Array.isArray(paper.authors)) {
    throw new ValidationError('must be an array', 'paper.authors');
  }

  return {
    id: requireString(paper.id, 'paper.id'),
    sourceRecordId: requireString(paper.sourceRecordId, 'paper.sourceRecordId'),
    conference: {
      slug: requireString(conference.slug, 'paper.conference.slug'),
      name: requireString(conference.name, 'paper.conference.name'),
      year: conference.year,
    },
    title: requireString(paper.title, 'paper.title'),
    abstract: requireString(paper.abstract, 'paper.abstract', { min: 10 }),
    authors: paper.authors.map((author, index) => {
      const record = requireRecord(author, `paper.authors[${index}]`);
      return {
        name: requireString(record.name, `paper.authors[${index}].name`),
        affiliation: nullableString(record.affiliation, `paper.authors[${index}].affiliation`),
      };
    }),
    division: nullableString(paper.division, 'paper.division'),
    sessionTitle: nullableString(paper.sessionTitle, 'paper.sessionTitle'),
    sessionType: nullableString(paper.sessionType, 'paper.sessionType'),
    sourceUrl: requireHttpUrl(paper.sourceUrl, 'paper.sourceUrl'),
    retrievedAt: requireString(paper.retrievedAt, 'paper.retrievedAt'),
    rawHash: requireString(paper.rawHash, 'paper.rawHash'),
    keywords: requireStringArray(paper.keywords ?? [], 'paper.keywords'),
  };
}

export function validateAnalyzeIdeaRequest(value) {
  const request = requireRecord(value, 'request');
  return {
    idea: requireString(request.idea, 'idea', { min: 20, max: 5000 }),
  };
}

export function validateAnalysisReport(value) {
  const report = requireRecord(value, 'report');
  const profile = requireRecord(report.ideaProfile, 'report.ideaProfile');
  if (!Array.isArray(report.closestWork)) {
    throw new ValidationError('must be an array', 'report.closestWork');
  }
  if (!Array.isArray(report.innovationPaths)) {
    throw new ValidationError('must be an array', 'report.innovationPaths');
  }

  return {
    ideaProfile: {
      summary: requireString(profile.summary, 'report.ideaProfile.summary'),
      topics: requireStringArray(profile.topics, 'report.ideaProfile.topics'),
      population: nullableString(profile.population, 'report.ideaProfile.population'),
      method: nullableString(profile.method, 'report.ideaProfile.method'),
      mechanisms: requireStringArray(
        profile.mechanisms ?? [],
        'report.ideaProfile.mechanisms',
      ),
    },
    coverageNotice: requireString(report.coverageNotice, 'report.coverageNotice'),
    closestWork: report.closestWork.map((item, index) => {
      const work = requireRecord(item, `report.closestWork[${index}]`);
      return {
        paperId: requireString(work.paperId, `report.closestWork[${index}].paperId`),
        title: requireString(work.title, `report.closestWork[${index}].title`),
        conference: requireString(
          work.conference,
          `report.closestWork[${index}].conference`,
        ),
        relationship: requireString(
          work.relationship,
          `report.closestWork[${index}].relationship`,
        ),
        overlapDimensions: requireStringArray(
          work.overlapDimensions,
          `report.closestWork[${index}].overlapDimensions`,
          { allowEmpty: false },
        ),
        evidence: requireString(work.evidence, `report.closestWork[${index}].evidence`),
        sourceUrl: requireHttpUrl(
          work.sourceUrl,
          `report.closestWork[${index}].sourceUrl`,
        ),
      };
    }),
    innovationPaths: report.innovationPaths.map((item, index) => {
      const path = requireRecord(item, `report.innovationPaths[${index}]`);
      const kind = requireString(path.kind, `report.innovationPaths[${index}].kind`);
      if (kind !== 'inference') {
        throw new ValidationError('must equal "inference"', `report.innovationPaths[${index}].kind`);
      }
      return {
        title: requireString(path.title, `report.innovationPaths[${index}].title`),
        rationale: requireString(
          path.rationale,
          `report.innovationPaths[${index}].rationale`,
        ),
        evidencePaperIds: requireStringArray(
          path.evidencePaperIds ?? [],
          `report.innovationPaths[${index}].evidencePaperIds`,
        ),
        kind,
      };
    }),
    recommendedNextSteps: requireStringArray(
      report.recommendedNextSteps,
      'report.recommendedNextSteps',
    ),
    limitations: requireStringArray(report.limitations, 'report.limitations', {
      allowEmpty: false,
    }),
  };
}

export function assertReportReferences(report, allowedPaperIds) {
  const allowed = new Set(allowedPaperIds);
  const unknown = [];
  for (const work of report.closestWork) {
    if (!allowed.has(work.paperId)) unknown.push(work.paperId);
  }
  for (const path of report.innovationPaths) {
    for (const id of path.evidencePaperIds) {
      if (!allowed.has(id)) unknown.push(id);
    }
  }
  if (unknown.length > 0) {
    throw new ValidationError(
      `contains unknown paper references: ${[...new Set(unknown)].join(', ')}`,
      'report',
    );
  }
  return report;
}
