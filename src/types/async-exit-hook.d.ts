declare function exitHook(hook: () => void): void;
declare function exitHook(hook: (callback: () => void) => void): void;

// TODO other declarations

export = exitHook;
