/**
 * Woodbury Pipeline Script Node Types
 * Auto-generated — do not edit manually.
 */

/** Context object passed to every execute() function */
interface ScriptContext {
  /** LLM text/JSON generation */
  llm: {
    /** Generate text from a prompt */
    generate(prompt: string, opts?: { temperature?: number; maxTokens?: number; model?: string }): Promise<string>;
    /** Generate and parse JSON from a prompt */
    generateJSON(prompt: string, schema?: object, opts?: { temperature?: number; maxTokens?: number; model?: string }): Promise<any>;
  };
  /** Progress tracking */
  progress: {
    start(total: number, label?: string): void;
    set(completed: number, total?: number, label?: string): void;
    increment(label?: string): void;
    complete(label?: string): void;
  };
  /** Extension tools (key = tool name, value = async function) */
  tools: Record<string, (params: any) => Promise<any>>;
  /** Append a log message */
  log(message: string): void;
}

/**
 * Every pipeline script node must export an execute function.
 */
type ExecuteFunction<TInputs = Record<string, unknown>, TOutputs = Record<string, unknown>> =
  (inputs: TInputs, context: ScriptContext) => Promise<TOutputs>;
