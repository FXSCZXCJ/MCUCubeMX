/// <reference types="vite/client" />

declare module '*.ejs?raw' {
  const content: string
  export default content
}
