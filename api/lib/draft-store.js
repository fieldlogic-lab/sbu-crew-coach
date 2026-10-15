const DRAFT_BLOB = 'coach-content/draft.json';
const DEFAULT_RETRIES = 3;

class DraftConflictError extends Error {
  constructor(message = 'draft changed since it was read') {
    super(message);
    this.name = 'DraftConflictError';
    this.statusCode = 412;
    this.code = 'DRAFT_CONFLICT';
  }
}

function isPreconditionFailure(error) {
  return error?.status === 412 || error?.statusCode === 412 ||
    error?.code === 'BLOB_PRECONDITION_FAILED' || error?.name === 'BlobPreconditionFailedError';
}

function createDraftStore(options = {}) {
  const blobSdk = options.getBlob && options.putBlob ? null : require('@vercel/blob');
  const getBlob = options.getBlob || blobSdk.get;
  const putBlob = options.putBlob || blobSdk.put;
  const ResponseImpl = options.ResponseImpl || Response;
  async function readBlob(pathname) {
    const result = await getBlob(pathname, { access: 'private', useCache: false });
    if (!result || !result.stream) return null;
    const data = await new ResponseImpl(result.stream).json();
    const etag = result.blob?.etag || result.headers?.get?.('etag') || result.etag;
    if (!etag) throw new Error(`Blob read did not include an ETag for ${pathname}`);
    return { data, etag };
  }

  async function writeBlob(pathname, data, { etag, ifNoneMatch, create = false } = {}) {
    if (create) ifNoneMatch = '*';
    if (!etag && ifNoneMatch !== '*') throw new DraftConflictError('If-Match is required to write an existing draft');
    try {
      return await putBlob(pathname, JSON.stringify(data), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: etag } : {}),
      });
    } catch (error) {
      if (isPreconditionFailure(error) || (!etag && (error?.status === 409 || error?.statusCode === 409 ||
        error?.code === 'BLOB_ALREADY_EXISTS' || /already exists|already been uploaded/i.test(error?.message || '')))) {
        throw new DraftConflictError();
      }
      throw error;
    }
  }

  async function updateBlob(pathname, mutate, { retries = DEFAULT_RETRIES } = {}) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const current = await readBlob(pathname);
      if (!current) return null;
      const next = await mutate(current.data);
      try {
        await writeBlob(pathname, next === undefined ? current.data : next, { etag: current.etag });
        return next === undefined ? current.data : next;
      } catch (error) {
        if (!(error instanceof DraftConflictError) || attempt === retries) throw error;
      }
    }
    throw new DraftConflictError();
  }

  return {
    readBlob,
    writeBlob,
    updateBlob,
    readDraft: () => readBlob(DRAFT_BLOB),
    writeDraft: (data, options) => writeBlob(DRAFT_BLOB, data, options),
    updateDraft: (mutate, options) => updateBlob(DRAFT_BLOB, mutate, options),
  };
}

function defaultStoreCall(method, ...args) {
  return createDraftStore()[method](...args);
}

module.exports = {
  readBlob: (...args) => defaultStoreCall('readBlob', ...args),
  writeBlob: (...args) => defaultStoreCall('writeBlob', ...args),
  updateBlob: (...args) => defaultStoreCall('updateBlob', ...args),
  readDraft: (...args) => defaultStoreCall('readDraft', ...args),
  writeDraft: (...args) => defaultStoreCall('writeDraft', ...args),
  updateDraft: (...args) => defaultStoreCall('updateDraft', ...args),
  createDraftStore,
  DraftConflictError,
  isPreconditionFailure,
  DRAFT_BLOB,
};
