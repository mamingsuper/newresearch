const DRAFT_KEY = 'idea-radar-program-draft';
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_MIME = Object.freeze({
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
});
const DRAFT_FIELDS = Object.freeze([
  'conferenceName', 'acronym', 'year', 'discipline', 'officialConferenceUrl', 'notes', 'kind', 'programUrl',
]);

function text(value, maxLength) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, maxLength) : '';
}

function submissionError(code, fieldErrors) {
  const error = new Error(code);
  error.code = code;
  if (fieldErrors) error.fieldErrors = Object.freeze({ ...fieldErrors });
  return error;
}

function storageLike(value) {
  return value && typeof value.getItem === 'function' && typeof value.setItem === 'function'
    && typeof value.removeItem === 'function' ? value : null;
}

function httpsUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname) return '';
    return parsed.href.length <= 2048 ? parsed.href : '';
  } catch {
    return '';
  }
}

export function serializeSubmissionDraft(value = {}, savedAt = Date.now()) {
  const fields = {};
  for (const field of DRAFT_FIELDS) {
    if (field === 'kind') fields.kind = value.kind === 'file' ? 'file' : 'url';
    else fields[field] = text(value[field], field === 'notes' ? 4000 : 2048);
  }
  return JSON.stringify({ version: 1, savedAt, fields });
}

export function readSubmissionDraft(encoded, now = Date.now()) {
  try {
    const parsed = JSON.parse(encoded);
    if (parsed?.version !== 1 || !Number.isFinite(parsed.savedAt) || parsed.savedAt > now + 60_000
      || now - parsed.savedAt > DRAFT_TTL_MS || !parsed.fields || typeof parsed.fields !== 'object') return null;
    const fields = {};
    for (const field of DRAFT_FIELDS) {
      if (field === 'kind') fields.kind = parsed.fields.kind === 'file' ? 'file' : 'url';
      else fields[field] = text(parsed.fields[field], field === 'notes' ? 4000 : 2048);
    }
    return fields;
  } catch {
    return null;
  }
}

function fileDescriptor(file) {
  if (!file || typeof file !== 'object') return { error: 'required' };
  const fileName = text(file.name, 255);
  const match = fileName.match(/\.([A-Za-z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();
  if (!fileName || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,254}$/.test(fileName) || !Object.hasOwn(FILE_MIME, extension ?? '')) {
    return { error: 'fileType' };
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) return { error: 'fileSize' };
  if (file.type !== FILE_MIME[extension]) return { error: 'fileType' };
  if (typeof file.arrayBuffer !== 'function') return { error: 'fileType' };
  return { fileName, fileSizeBytes: file.size, mimeType: file.type };
}

export function validateProgramSubmissionForm(value = {}, file = null) {
  const errors = {};
  const conferenceName = text(value.conferenceName, 201);
  const acronym = text(value.acronym, 33);
  const discipline = text(value.discipline, 101);
  const notes = typeof value.notes === 'string' ? value.notes.normalize('NFKC').trim() : '';
  const year = Number(value.year);
  const officialConferenceUrl = httpsUrl(text(value.officialConferenceUrl, 2049));
  const kind = value.kind === 'file' ? 'file' : 'url';

  if (!conferenceName || conferenceName.length > 200) errors.conferenceName = 'required';
  if (!acronym || acronym.length > 32) errors.acronym = 'required';
  if (!Number.isInteger(year) || year < 1900 || year > 2100) errors.year = 'year';
  if (!discipline || discipline.length > 100) errors.discipline = 'required';
  if (!officialConferenceUrl) errors.officialConferenceUrl = 'https';
  if (notes.length > 4000) errors.notes = 'tooLong';
  if (value.rightsAttested !== true) errors.rightsAttested = 'rights';

  const base = {
    conferenceName,
    acronym,
    year,
    discipline,
    officialConferenceUrl,
    notes,
    rightsAttested: true,
  };
  if (kind === 'url') {
    const programUrl = httpsUrl(text(value.programUrl, 2049));
    if (!programUrl) errors.programUrl = 'https';
    return { valid: Object.keys(errors).length === 0, errors, payload: { ...base, kind, programUrl } };
  }

  const descriptor = fileDescriptor(file);
  if (descriptor.error) errors.file = descriptor.error;
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    payload: descriptor.error ? { ...base, kind } : { ...base, kind, ...descriptor },
  };
}

export async function sha256Hex(file, subtle = globalThis.crypto?.subtle) {
  if (!subtle?.digest || typeof file?.arrayBuffer !== 'function') throw submissionError('program_submission_hash_failed');
  let bytes;
  try { bytes = await file.arrayBuffer(); } catch { throw submissionError('program_submission_hash_failed'); }
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createProgramSubmissionController({
  auth,
  storage,
  api,
  draftStorage,
  now = Date.now,
  randomUUID = () => globalThis.crypto.randomUUID(),
  subtle = globalThis.crypto?.subtle,
  onStateChange = () => {},
} = {}) {
  const localDraft = storageLike(draftStorage);
  const listeners = new Set([onStateChange].filter((listener) => typeof listener === 'function'));
  let current = Object.freeze({ status: 'idle', progress: 0, errorCode: '', canRetry: false, orphan: false, result: null });
  let retryIntent = null;

  function emit(patch) {
    current = Object.freeze({ ...current, ...patch });
    for (const listener of listeners) listener(current);
  }

  function saveDraft(fields) {
    if (!localDraft) return false;
    try {
      localDraft.setItem(DRAFT_KEY, serializeSubmissionDraft(fields, now()));
      return true;
    } catch {
      return false;
    }
  }

  function clearDraft() {
    try { localDraft?.removeItem(DRAFT_KEY); } catch { /* Draft storage is best-effort. */ }
  }

  async function accessContext() {
    const userId = typeof auth?.getUserId === 'function' ? auth.getUserId() : null;
    if (!UUID_PATTERN.test(userId ?? '')) throw submissionError('program_submission_auth_required');
    let accessToken;
    try { accessToken = await auth.getAccessToken(); } catch { throw submissionError('program_submission_auth_required'); }
    if (typeof accessToken !== 'string' || !accessToken) throw submissionError('program_submission_auth_required');
    return { userId, accessToken };
  }

  async function callApi(payload, orphanPath = null) {
    const { accessToken } = await accessContext();
    emit({ status: 'submitting', progress: 100, errorCode: '', canRetry: false, orphan: Boolean(orphanPath), result: null });
    try {
      const result = await api.submit(payload, { accessToken });
      if (!UUID_PATTERN.test(result?.submissionId ?? '') || result?.status !== 'submitted') throw new Error('invalid response');
      retryIntent = null;
      clearDraft();
      emit({ status: 'success', progress: 100, errorCode: '', canRetry: false, orphan: false, result });
      return result;
    } catch {
      retryIntent = { phase: 'api', payload, orphanPath };
      emit({ status: 'error', progress: 100, errorCode: 'api', canRetry: true, orphan: Boolean(orphanPath), result: null });
      throw submissionError('program_submission_api_failed');
    }
  }

  async function submit({ fields = {}, file = null } = {}) {
    const validated = validateProgramSubmissionForm(fields, file);
    if (!validated.valid) throw submissionError('program_submission_invalid', validated.errors);
    saveDraft(fields);
    const { userId } = await accessContext();
    retryIntent = null;

    if (validated.payload.kind === 'url') return callApi(validated.payload);

    const uploadId = randomUUID();
    if (!UUID_PATTERN.test(uploadId ?? '')) throw submissionError('program_submission_upload_failed');
    const path = `${userId}/${uploadId}/${validated.payload.fileName}`;
    emit({ status: 'hashing', progress: 5, errorCode: '', canRetry: false, orphan: false, result: null });
    let sha256;
    try { sha256 = await sha256Hex(file, subtle); } catch {
      retryIntent = { phase: 'full', input: { fields, file } };
      emit({ status: 'error', progress: 5, errorCode: 'hash', canRetry: true, orphan: false, result: null });
      throw submissionError('program_submission_hash_failed');
    }

    emit({ status: 'uploading', progress: 10, errorCode: '', canRetry: false, orphan: false, result: null });
    try {
      await storage.upload({
        path,
        file,
        mimeType: validated.payload.mimeType,
        onProgress(value) {
          const bounded = Math.max(0, Math.min(100, Number(value) || 0));
          emit({ status: 'uploading', progress: Math.round(10 + bounded * .8) });
        },
      });
    } catch {
      retryIntent = { phase: 'full', input: { fields, file } };
      emit({ status: 'error', progress: current.progress, errorCode: 'upload', canRetry: true, orphan: false, result: null });
      throw submissionError('program_submission_upload_failed');
    }

    const payload = {
      ...validated.payload,
      storagePath: path,
      sha256,
    };
    return callApi(payload, path);
  }

  return Object.freeze({
    state: () => current,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    validate: validateProgramSubmissionForm,
    saveDraft,
    loadDraft() {
      if (!localDraft) return null;
      let encoded;
      try { encoded = localDraft.getItem(DRAFT_KEY); } catch { return null; }
      const draft = encoded ? readSubmissionDraft(encoded, now()) : null;
      if (!draft && encoded) clearDraft();
      return draft;
    },
    clearDraft,
    submit,
    async retry() {
      if (!retryIntent) throw submissionError('program_submission_retry_unavailable');
      if (retryIntent.phase === 'full') return submit(retryIntent.input);
      return callApi(retryIntent.payload, retryIntent.orphanPath);
    },
    async cleanupOrphan() {
      const path = retryIntent?.orphanPath;
      if (!path) throw submissionError('program_submission_cleanup_unavailable');
      try { await storage.remove(path); } catch {
        emit({ status: 'error', errorCode: 'cleanup', canRetry: true, orphan: true });
        throw submissionError('program_submission_cleanup_failed');
      }
      retryIntent = null;
      emit({ status: 'idle', progress: 0, errorCode: '', canRetry: false, orphan: false, result: null });
      return true;
    },
  });
}

function formControl(form, name) {
  return form.elements?.namedItem?.(name) ?? form.querySelector?.(`[name="${name}"]`) ?? null;
}

function readForm(form, kind) {
  return {
    conferenceName: formControl(form, 'conferenceName')?.value ?? '',
    acronym: formControl(form, 'acronym')?.value ?? '',
    year: formControl(form, 'year')?.value ?? '',
    discipline: formControl(form, 'discipline')?.value ?? '',
    officialConferenceUrl: formControl(form, 'officialConferenceUrl')?.value ?? '',
    notes: formControl(form, 'notes')?.value ?? '',
    rightsAttested: formControl(form, 'rightsAttested')?.checked === true,
    kind,
    programUrl: kind === 'url' ? formControl(form, 'programUrl')?.value ?? '' : '',
  };
}

export function initProgramSubmissionUi({
  form,
  controller,
  getAuthState,
  onRequireAuth,
  t = (key) => key,
} = {}) {
  if (!form?.addEventListener || !controller?.submit || typeof getAuthState !== 'function' || typeof onRequireAuth !== 'function') {
    throw new TypeError('Program submission UI requires form, controller, and Auth hooks');
  }
  const tabs = [...form.querySelectorAll('[data-program-kind]')];
  const panels = [...form.querySelectorAll('[data-program-panel]')];
  const errorNodes = [...form.querySelectorAll('[data-program-error-for]')];
  const progress = form.querySelector('#program-upload-progress');
  const status = form.querySelector('#program-submission-status');
  const submitButton = form.querySelector('#program-submit-button');
  const retryButton = form.querySelector('#program-retry-button');
  const cleanupButton = form.querySelector('#program-cleanup-button');
  let kind = 'url';

  function setKind(next) {
    kind = next === 'file' ? 'file' : 'url';
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.programKind === kind));
    for (const panel of panels) panel.hidden = panel.dataset.programPanel !== kind;
    const url = formControl(form, 'programUrl');
    const file = formControl(form, 'programFile');
    if (url) url.required = kind === 'url';
    if (file) file.required = kind === 'file';
    controller.saveDraft(readForm(form, kind));
  }

  function showErrors(errors = {}) {
    for (const node of errorNodes) {
      const code = errors[node.dataset.programErrorFor];
      node.textContent = code ? t(`program.error.${code}`) : '';
      node.hidden = !code;
    }
    const firstField = Object.keys(errors)[0];
    if (firstField) formControl(form, firstField === 'file' ? 'programFile' : firstField)?.focus?.();
  }

  function renderState(state = controller.state()) {
    const active = ['hashing', 'uploading', 'submitting'].includes(state.status);
    if (progress) {
      progress.value = state.progress;
      progress.hidden = state.status === 'idle';
    }
    if (status) status.textContent = state.status === 'idle' ? '' : t(`program.status.${state.status}`, { progress: state.progress });
    if (submitButton) submitButton.disabled = active;
    if (retryButton) retryButton.hidden = !state.canRetry;
    if (cleanupButton) cleanupButton.hidden = !state.orphan;
  }

  for (const tab of tabs) tab.addEventListener('click', () => setKind(tab.dataset.programKind));
  form.addEventListener('input', () => controller.saveDraft(readForm(form, kind)));
  form.addEventListener('change', () => controller.saveDraft(readForm(form, kind)));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = readForm(form, kind);
    controller.saveDraft(fields);
    if (getAuthState()?.status !== 'authenticated') {
      if (status) status.textContent = t('program.status.auth');
      onRequireAuth(submitButton);
      return;
    }
    const file = kind === 'file' ? formControl(form, 'programFile')?.files?.[0] ?? null : null;
    const checked = controller.validate(fields, file);
    showErrors(checked.errors);
    if (!checked.valid) return;
    try { await controller.submit({ fields, file }); } catch (error) {
      if (error?.fieldErrors) showErrors(error.fieldErrors);
    }
  });
  retryButton?.addEventListener('click', async () => { try { await controller.retry(); } catch { /* State contains safe feedback. */ } });
  cleanupButton?.addEventListener('click', async () => { try { await controller.cleanupOrphan(); } catch { /* State contains safe feedback. */ } });

  const draft = controller.loadDraft();
  if (draft) {
    for (const field of DRAFT_FIELDS) {
      if (field === 'kind') continue;
      const control = formControl(form, field);
      if (control && typeof draft[field] === 'string') control.value = draft[field];
    }
    setKind(draft.kind);
  } else {
    setKind('url');
  }
  const unsubscribe = controller.subscribe(renderState);
  return Object.freeze({
    refresh: () => renderState(),
    focus: () => submitButton?.focus?.(),
    destroy: unsubscribe,
  });
}
