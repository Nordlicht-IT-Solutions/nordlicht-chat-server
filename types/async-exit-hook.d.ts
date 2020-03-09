declare module 'async-exit-hook' {
  function exitHook(hook: () => void): void;
  function exitHook(hook: (callback: () => void) => void): void;

  // TODO other declarations

  export = exitHook;
}
