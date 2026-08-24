const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value, max = 4000) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, max) : '';
}

export function createAdminSubmissionController({ supabase, api, getAccessToken, isAdmin } = {}) {
  async function requireAdmin() {
    if (!isAdmin?.()) throw Object.assign(new Error('admin_required'), { code: 'admin_required' });
    const token = await getAccessToken?.();
    if (!token) throw Object.assign(new Error('admin_required'), { code: 'admin_required' });
    return token;
  }
  return Object.freeze({
    async list() {
      await requireAdmin();
      const { data, error } = await supabase.from('program_submissions')
        .select('id,conference_name,conference_acronym,conference_year,discipline,official_conference_url,program_url,file_name,status,review_reason,created_at,reviewed_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error('admin_queue_unavailable');
      return Array.isArray(data) ? data : [];
    },
    async review({ submissionId, expectedStatus, decision, reason = '' }) {
      const token = await requireAdmin();
      if (!UUID.test(submissionId ?? '')) throw new Error('invalid_submission');
      return api.review({ submissionId, expectedStatus, decision, reason: clean(reason) }, { accessToken: token });
    },
    async preview(submissionId) { const accessToken = await requireAdmin(); return api.preview({ submissionId }, { accessToken }); },
    async confirm(submissionId) { const accessToken = await requireAdmin(); return api.confirm({ submissionId }, { accessToken }); },
    async processEmbeddings(batchSize = 10) { const accessToken = await requireAdmin(); return api.processEmbeddings({ batchSize }, { accessToken }); },
  });
}

function el(document, tag, value, className) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
}

export function renderAdminSubmissions({ root, submissions = [], t = (key) => key, onReview = () => {} } = {}) {
  if (!root?.ownerDocument || !root?.replaceChildren) return { visibleCount: submissions.length };
  const { ownerDocument: document } = root;
  const fragment = document.createDocumentFragment();
  if (!submissions.length) fragment.append(el(document, 'p', t('admin.empty'), 'empty-state'));
  for (const submission of submissions) {
    const card = el(document, 'article', undefined, 'admin-submission-card');
    card.append(el(document, 'p', `${submission.conference_acronym} ${submission.conference_year} · ${submission.status}`, 'conference-meta'));
    card.append(el(document, 'h3', submission.conference_name));
    const actions = el(document, 'div', undefined, 'program-actions');
    const choices = submission.status === 'submitted'
      ? [['start_review', t('admin.startReview')], ['reject', t('admin.reject')]]
      : submission.status === 'under_review'
        ? [['approve', t('admin.approve')], ['reject', t('admin.reject')]]
        : [];
    for (const [decision, label] of choices) {
      const button = el(document, 'button', label);
      button.type = 'button';
      button.addEventListener('click', () => {
        const reason = decision === 'reject' ? window.prompt(t('admin.reasonPrompt')) : '';
        if (decision === 'reject' && !reason?.trim()) return;
        onReview({ submissionId: submission.id, expectedStatus: submission.status, decision, reason: reason ?? '' });
      });
      actions.append(button);
    }
    if (submission.status === 'approved') {
      const preview = el(document, 'button', t('admin.preview'));
      preview.type = 'button'; preview.addEventListener('click', () => onReview({ action: 'preview', submissionId: submission.id })); actions.append(preview);
    }
    if (submission.status === 'import_preview') {
      const confirm = el(document, 'button', t('admin.confirm'));
      confirm.type = 'button'; confirm.addEventListener('click', () => onReview({ action: 'confirm', submissionId: submission.id })); actions.append(confirm);
    }
    if (submission.status === 'imported') {
      const embeddings = el(document, 'button', t('admin.processEmbeddings'));
      embeddings.type = 'button'; embeddings.addEventListener('click', () => onReview({ action: 'embeddings', submissionId: submission.id })); actions.append(embeddings);
    }
    card.append(actions);
    fragment.append(card);
  }
  root.replaceChildren(fragment);
  return { visibleCount: submissions.length };
}
