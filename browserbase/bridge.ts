import http from "node:http"

type Message = { id?: number; method?: string; params?: Record<string, unknown>; sessionId?: string; result?: Record<string, unknown>; error?: { message: string } }
type Paused = { requestId: string; networkId?: string; request: { url: string; method: string; headers: Record<string, string>; hasPostData?: boolean; postData?: string; postDataEntries?: { bytes?: string }[] } }

/** HTTP-only bridge, restricted to one exact loopback origin. Never logs headers or bodies. */
export class LocalBridge {
  private socket: WebSocket
  private sequence = 0
  private pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private targets = new Map<string, string>()
  readonly errors: string[] = []
  readonly responses: { method: string; path: string; status: number }[] = []
  failNextMutation = false
  private origin: string

  private constructor(url: string, origin: string) {
    this.origin = new URL(origin).origin
    if (this.origin !== "http://localhost:3000") throw new Error("Bridge permits only http://localhost:3000")
    this.socket = new WebSocket(url)
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Message
      if (message.id) {
        const item = this.pending.get(message.id)
        if (!item) return
        clearTimeout(item.timer)
        this.pending.delete(message.id)
        if (message.error) item.reject(new Error(message.error.message))
        else item.resolve(message.result ?? {})
      } else if (message.method === "Fetch.requestPaused" && message.sessionId) {
        void this.forward(message.params as unknown as Paused, message.sessionId).catch((error: Error) => {
          if (!error.message.includes("Invalid InterceptionId")) this.errors.push(error.message)
        })
      }
    })
    this.socket.addEventListener("close", () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timer)
        item.reject(new Error("CDP bridge closed"))
      }
      this.pending.clear()
    })
  }

  static async connect(url: string, origin = "http://localhost:3000") {
    const bridge = new LocalBridge(url, origin)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { bridge.close(); reject(new Error("CDP connection timed out")) }, 30_000)
      bridge.socket.addEventListener("open", () => { clearTimeout(timer); resolve() }, { once: true })
      bridge.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")) }, { once: true })
    })
    return bridge
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 60_000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  async attachPages() {
    const result = await this.send("Target.getTargets")
    const targets = (result.targetInfos as { targetId: string; type: string; url: string }[]).filter(
      (target) => target.type === "page" && !this.targets.has(target.targetId)
    )
    await Promise.all(
      targets.map(async (target) => {
        const { sessionId } = await this.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })
        const session = String(sessionId)
        this.targets.set(target.targetId, session)
        await this.send("Network.enable", {}, session)
        await this.send("Emulation.setTimezoneOverride", { timezoneId: "Africa/Cairo" }, session)
        await this.send("Fetch.enable", { patterns: [{ urlPattern: `${this.origin}/*`, requestStage: "Request" }] }, session)
      })
    )
  }

  async emulate(params: Record<string, unknown>) {
    await Promise.all([...this.targets.values()].map((session) => this.send("Emulation.setUserAgentOverride", params, session)))
  }

  private async forward(event: Paused, session: string) {
    const { request, requestId } = event
    if (new URL(request.url).origin !== this.origin) {
      await this.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, session)
      return
    }
    try {
      if (this.failNextMutation && request.method === "POST") {
        this.failNextMutation = false
        await this.send("Fetch.failRequest", { requestId, errorReason: "ConnectionReset" }, session)
        return
      }
      let body: Buffer | undefined
      if (request.postDataEntries?.every((entry) => entry.bytes !== undefined)) {
        body = Buffer.concat(request.postDataEntries.map((entry) => Buffer.from(entry.bytes!, "base64")))
      } else if (request.postData !== undefined) body = Buffer.from(request.postData)
      else if (request.hasPostData && event.networkId) {
        const data = await this.send("Network.getRequestPostData", { requestId: event.networkId }, session)
        body = Buffer.from(String(data.postData))
      }
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(request.headers)) {
        if (!/^(host|connection|content-length|accept-encoding)$/i.test(key)) headers[key] = value
      }
      headers.host = new URL(this.origin).host
      headers["accept-encoding"] = "identity"
      if (body) headers["content-length"] = String(body.length)
      const response = await new Promise<{ status: number; headers: { name: string; value: string }[]; body: Buffer }>((resolve, reject) => {
        const local = http.request(request.url, { method: request.method, headers, timeout: 45_000 }, (res) => {
          const chunks: Buffer[] = []
          let size = 0
          res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 32 * 1024 * 1024) local.destroy(new Error("Bridge response exceeded 32 MB")); else chunks.push(chunk) })
          res.on("error", reject)
          res.on("end", () => {
            const responseHeaders: { name: string; value: string }[] = []
            for (let index = 0; index < res.rawHeaders.length; index += 2) {
              const name = res.rawHeaders[index]
              if (!/^(connection|keep-alive|transfer-encoding|content-length)$/i.test(name)) responseHeaders.push({ name, value: res.rawHeaders[index + 1] })
            }
            resolve({ status: res.statusCode ?? 502, headers: responseHeaders, body: Buffer.concat(chunks) })
          })
        })
        local.on("timeout", () => local.destroy(new Error("Local app request timed out")))
        local.on("error", reject)
        local.end(body)
      })
      this.responses.push({ method: request.method, path: new URL(request.url).pathname, status: response.status })
      await this.send("Fetch.fulfillRequest", { requestId, responseCode: response.status, responseHeaders: response.headers, body: response.body.toString("base64") }, session)
    } catch (error) {
      await this.send("Fetch.failRequest", { requestId, errorReason: "Failed" }, session).catch(() => {})
      throw error
    }
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return
    await Promise.allSettled([...this.targets.values()].map((session) => this.send("Fetch.disable", {}, session)))
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000)
      this.socket.addEventListener("close", () => { clearTimeout(timer); resolve() }, { once: true })
      this.socket.close()
    })
  }
}
