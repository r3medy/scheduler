import { mkdir, writeFile } from "node:fs/promises"
import { createSession } from "./session.ts"

await mkdir("artifacts", { recursive: true })
const session = await createSession()
try {
  console.log(`Session: https://www.browserbase.com/sessions/${session.browser.sessionId}`)
  await session.page.goto("http://localhost:3000/")
  console.log((await session.page.snapshot()).formattedTree)
  await writeFile("artifacts/smoke.png", await session.page.screenshot({ fullPage: true }))
  console.log(`Forwarded ${session.bridge.responses.length} HTTP requests; bridge errors: ${session.bridge.errors.length}`)
} finally { await session.close() }
