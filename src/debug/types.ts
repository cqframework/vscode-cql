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
