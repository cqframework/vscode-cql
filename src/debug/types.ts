export interface CqlSpan {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  localId?: string;
}

export interface ActiveSplitDebugHook {
  highlightCqlSpan(span: CqlSpan): void;
  noteExternalReveal(): void;
  swapLibrary(newCqlPath: string): Promise<boolean>;
}

export function normalizeSpan(frame: {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  instructionPointerReference?: string;
}): CqlSpan {
  const line = frame.line ?? 1;
  const column = frame.column ?? 1;
  return {
    line,
    column,
    endLine: frame.endLine ?? line,
    endColumn: frame.endColumn ?? column,
    ...(frame.instructionPointerReference ? { localId: frame.instructionPointerReference } : {}),
  };
}
