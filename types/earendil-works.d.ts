declare module "@earendil-works/pi-coding-agent" {
  interface UIContext {
    notify(msg: string, kind?: "info" | "error" | "warning"): void;
  }
  interface CommandContext {
    cwd: string;
    hasUI: boolean;
    ui: UIContext;
  }
  interface CommandRegistration {
    description: string;
    handler: (args: string, ctx: CommandContext) => void | Promise<void>;
  }
  interface EventBus {
    emit(channel: string, data: unknown): void;
    on(channel: string, handler: (data: unknown) => void): () => void;
  }
  interface ExtensionAPI {
    registerCommand(name: string, reg: CommandRegistration): void;
    sendUserMessage(text: string): void;
    events: EventBus;
  }
  export type { ExtensionAPI, CommandContext, UIContext, EventBus };
}
