function isFileBlockWithData(
  block: unknown
): block is { type: 'file'; data: Record<string, unknown> } {
  if (!block || typeof block !== 'object') return false;
  const maybeBlock = block as { type?: unknown; data?: unknown };
  return (
    maybeBlock.type === 'file' &&
    Boolean(maybeBlock.data) &&
    typeof maybeBlock.data === 'object'
  );
}

function hasEnrichedUrls(data: Record<string, unknown>): boolean {
  return (
    typeof data.chat_url === 'string' ||
    typeof data.preview_url === 'string' ||
    typeof data.full_url === 'string'
  );
}

function getFileId(block: { data: Record<string, unknown> }): string | null {
  const fileId = block.data.file_id;
  return typeof fileId === 'string' && fileId.length > 0 ? fileId : null;
}

export function mergeBlocksPreservingFileUrls(
  existingBlocks: unknown,
  incomingBlocks: unknown
): unknown {
  if (!Array.isArray(incomingBlocks)) return incomingBlocks;
  if (!Array.isArray(existingBlocks)) return incomingBlocks;

  return incomingBlocks.map((incomingBlock, index) => {
    if (!isFileBlockWithData(incomingBlock)) return incomingBlock;
    if (hasEnrichedUrls(incomingBlock.data)) return incomingBlock;

    const incomingFileId = getFileId(incomingBlock);
    const existingById = incomingFileId
      ? existingBlocks.find((candidate) => {
          if (!isFileBlockWithData(candidate)) return false;
          return getFileId(candidate) === incomingFileId;
        })
      : undefined;

    const existingBlock = existingById ?? existingBlocks[index];
    if (!isFileBlockWithData(existingBlock) || !hasEnrichedUrls(existingBlock.data)) {
      return incomingBlock;
    }

    const mergedData = { ...incomingBlock.data };
    if (
      typeof existingBlock.data.chat_url === 'string' &&
      typeof mergedData.chat_url !== 'string'
    ) {
      mergedData.chat_url = existingBlock.data.chat_url;
    }
    if (
      typeof existingBlock.data.preview_url === 'string' &&
      typeof mergedData.preview_url !== 'string'
    ) {
      mergedData.preview_url = existingBlock.data.preview_url;
    }
    if (
      typeof existingBlock.data.full_url === 'string' &&
      typeof mergedData.full_url !== 'string'
    ) {
      mergedData.full_url = existingBlock.data.full_url;
    }
    if (typeof existingBlock.data.url === 'string' && typeof mergedData.url !== 'string') {
      mergedData.url = existingBlock.data.url;
    }

    return {
      ...incomingBlock,
      data: mergedData,
    };
  });
}
