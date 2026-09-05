// Local rendering regression: node browserbase/week-layout.mjs
// Uses synthetic callbacks; no account, API, or database access.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "playwright-core"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(resolve(root, "package.json"))
const vitestRequire = createRequire(require.resolve("vitest/package.json"))
const { createServer } = await import(
  pathToFileURL(vitestRequire.resolve("vite"))
)
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react"))
)
const artifacts = resolve(root, ".next/week-layout-qa")
await mkdir(artifacts, { recursive: true })

const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
  resolve: { alias: { "@": root } },
  plugins: [
    {
      name: "week-layout-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "/week-fixture.js") return "\0week-fixture.js"
        if (
          id
            .replaceAll("\\", "/")
            .endsWith("/components/callbacks/callback-details-dialog")
        ) {
          return "\0callback-trigger.js"
        }
      },
      load(id) {
        if (id === "\0callback-trigger.js") {
          return `import React from 'react';
            export function CallbackDetailsDialog({callbackId, ...props}) {
              return React.createElement('button', {'data-callback-id': callbackId, ...props});
            }`
        }
        if (id === "\0week-fixture.js") {
          return `import React from 'react';
            import {createRoot} from 'react-dom/client';
            import {WeekView} from '/components/scheduling-calendar/week-view.tsx';
            import '/app/globals.css';
            const exact = (id, time) => {
              const stamp = new Date('2026-09-05T' + time + ':00').toISOString();
              return {id, accountHolderName: id, accountReference: null,
                scheduleMode: 'exact', scheduledAt: stamp, startsAt: stamp, temporalState: 'overdue'};
            };
            const lewis = exact('LEWIS', '18:55');
            const markers = [
              {...lewis, scheduleMode: 'window', windowStartAt: lewis.startsAt,
                windowEndAt: new Date('2026-09-05T19:00:00').toISOString()},
              exact('MAX', '18:55'), exact('NOON', '12:00'), exact('AFTERNOON', '13:55'),
              ...(new URLSearchParams(location.search).has('late') ? [exact('LATE', '23:59')] : [])
            ];
            createRoot(document.getElementById('root')).render(
              React.createElement(WeekView, {focusedDate: '2026-09-05', markers})
            );`
        }
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url?.split("?")[0] !== "/") return next()
          const html = await vite.transformIndexHtml(
            "/",
            `<!doctype html>
            <html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;padding:24px;font-family:Arial,sans-serif">
            <main id="root" style="border:1px solid var(--border);border-radius:14px;overflow:hidden"></main>
            <script type="module" src="/week-fixture.js"></script></body></html>`
          )
          response.setHeader("Content-Type", "text/html")
          response.end(html)
        })
      },
    },
    react(),
  ],
})

let browser
try {
  await server.listen()
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  for (const width of [1778, 885, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto("http://127.0.0.1:4179/")
    await page.locator('[data-callback-id="MAX"]').waitFor()
    const result = await page.evaluate(() => {
      const failures = []
      const near = (a, b) => Math.abs(a - b) < 1
      for (const row of document.querySelectorAll("[data-week-hour]")) {
        const bounds = row.getBoundingClientRect()
        const label = row.querySelector("time").getBoundingClientRect()
        if (!near(label.y + label.height / 2, bounds.y + bounds.height / 2))
          failures.push("Hour label not centered: " + row.dataset.weekHour)
        for (const cell of row.querySelectorAll("[data-week-day]")) {
          const rect = cell.getBoundingClientRect()
          const header = document
            .querySelector('[data-week-header="' + cell.dataset.weekDay + '"]')
            .getBoundingClientRect()
          if (!near(rect.left, header.left) || !near(rect.width, header.width))
            failures.push("Day header mismatch")
          if (rect.top < bounds.top || rect.bottom > bounds.bottom + 1)
            failures.push("Cell outside row")
          let previousBottom = rect.top
          for (const card of cell.querySelectorAll("button")) {
            const box = card.getBoundingClientRect()
            if (
              box.left < rect.left ||
              box.right > rect.right ||
              box.top < previousBottom ||
              box.bottom > rect.bottom
            )
              failures.push(
                "Card outside cell or overlapping: " + card.textContent
              )
            previousBottom = box.bottom
          }
        }
      }
      if (document.documentElement.scrollWidth > innerWidth)
        failures.push("Page overflows horizontally")
      return failures
    })
    assert.deepEqual(result, [], `Layout at ${width}px`)
    assert.equal(
      await page.locator('[data-week-hour="12"] > div > time').textContent(),
      "12 PM"
    )
    assert.equal(
      await page.locator('[data-week-hour="13"] > div > time').textContent(),
      "1 PM"
    )
    assert.equal(await page.locator('[data-week-hour="18"] button').count(), 2)
    await page.screenshot({
      path: resolve(artifacts, `week-${width}.png`),
      fullPage: true,
    })
    console.log(
      `PASS ${width}px: hour labels, day columns, card containment, no overlaps, no page overflow`
    )
  }
  await page.goto("http://127.0.0.1:4179/?late")
  await page
    .locator('[data-week-hour="23"] [data-callback-id="LATE"]')
    .waitFor()
  assert.equal(await page.locator('[data-week-hour="24"]').count(), 0)
  assert.deepEqual(errors, [])
  console.log(`PASS midnight boundary. Screenshots: ${artifacts}`)
} finally {
  await browser?.close()
  await server.close()
}
