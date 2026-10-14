/// <reference types="vite/client" />

declare module "espeak-ng" {
  type ESpeakModule = {
    FS: { writeFile(path: string, data: string): void; readFile(path: string, options: { encoding: "utf8" }): string }
  }
  export default function ESpeakNg(options: {
    arguments: string[]
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) => object
    preRun?: Array<(module: ESpeakModule) => void>
    print?: (message: string) => void
    printErr?: (message: string) => void
  }): Promise<ESpeakModule>
}
