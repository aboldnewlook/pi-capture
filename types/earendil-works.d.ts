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
  interface ExtensionAPI {
    registerCommand(name: string, reg: CommandRegistration): void;
    sendUserMessage(text: string): void;
  }
  export type { ExtensionAPI, CommandContext, UIContext };
}
