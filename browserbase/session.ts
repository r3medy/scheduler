import { browserbase, Stagehand } from "@browserbasehq/stagehand"
import { LocalBridge } from "./bridge.ts"
import { chromium, type Browser as PlaywrightBrowser } from "playwright-core"

export async function createSession() {
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) throw new Error("Set BROWSERBASE_API_KEY in the root .env.local")
  const browser = await browserbase.launch({ apiKey, api_timeout: 1800 })
  let bridge: LocalBridge | undefined
  let stagehand: Stagehand | undefined
  let interaction: PlaywrightBrowser | undefined
  try {
    const response = await fetch(`https://api.browserbase.com/v1/sessions/${browser.sessionId}`, { headers: { "x-bb-api-key": apiKey }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Session lookup failed: ${response.status}`)
    const session = await response.json() as { connectUrl?: string }
    if (!session.connectUrl) throw new Error("Session lookup did not provide a CDP connection URL")
    bridge = await LocalBridge.connect(session.connectUrl)
    await bridge.attachPages()
    stagehand = await Stagehand.create({ browser, logging: { level: "error" } })
    const page = (await browser.context.pages())[0] ?? await browser.context.newPage()
    await bridge.attachPages()
    await page.setViewportSize(1440, 1000)
    interaction = await chromium.connectOverCDP(session.connectUrl)
    const userPage = interaction.contexts()[0].pages()[0]
    userPage.setDefaultTimeout(15_000)
    userPage.setDefaultNavigationTimeout(60_000)
    return { browser, stagehand, page, userPage, bridge, close: async () => {
      try { await stagehand?.close() } finally { try { await interaction?.close() } finally { try { await bridge?.close() } finally { await browser.close() } } }
    } }
  } catch (error) {
    try { await stagehand?.close() } finally { try { await interaction?.close() } finally { try { await bridge?.close() } finally { await browser.close() } } }
    throw error
  }
}
