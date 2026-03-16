/**
 * Woodbury Pipeline Test Helpers
 * Provides mock ScriptContext for testing execute() functions.
 * Auto-generated — safe to customize.
 */

interface MockContextOverrides {
  llmGenerate?: string | ((prompt: string) => string | Promise<string>);
  llmGenerateJSON?: unknown | ((prompt: string) => unknown | Promise<unknown>);
  tools?: Record<string, (params: any) => Promise<any>>;
}

interface ProgressState {
  started: boolean;
  completed: number;
  total?: number;
  label?: string;
}

export function createMockContext(overrides: MockContextOverrides = {}): {
  context: any;
  logs: string[];
  progressState: ProgressState;
} {
  const logs: string[] = [];
  const progressState: ProgressState = { started: false, completed: 0 };

  const context = {
    llm: {
      generate: async (prompt: string) => {
        if (typeof overrides.llmGenerate === 'function') return overrides.llmGenerate(prompt);
        return overrides.llmGenerate ?? '';
      },
      generateJSON: async (prompt: string) => {
        if (typeof overrides.llmGenerateJSON === 'function') return overrides.llmGenerateJSON(prompt);
        return overrides.llmGenerateJSON ?? {};
      },
    },
    log: (message: string) => { logs.push(String(message)); },
    tools: new Proxy({} as Record<string, any>, {
      get(_target, prop) {
        if (typeof prop === 'string' && overrides.tools && prop in overrides.tools) {
          return overrides.tools[prop];
        }
        return async () => {
          throw new Error(`context.tools.${String(prop)} is not mocked`);
        };
      },
    }),
    progress: {
      start(total: number, label?: string) { progressState.started = true; progressState.completed = 0; progressState.total = total; progressState.label = label; },
      set(completed: number, total?: number, label?: string) { progressState.started = true; progressState.completed = completed; if (typeof total === 'number') progressState.total = total; if (label) progressState.label = label; },
      increment(label?: string) { progressState.started = true; progressState.completed += 1; if (label) progressState.label = label; },
      complete(label?: string) { progressState.started = true; if (typeof progressState.total === 'number') progressState.completed = progressState.total; if (label) progressState.label = label; },
    },
  };

  return { context, logs, progressState };
}
