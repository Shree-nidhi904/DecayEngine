// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PersistStatus, persistText } from "./components/PersistStatus"
import { UpdateBanner, updateReadyText } from "./components/UpdateBanner"
import { registerApp } from "./pwa"

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, "storage")
})

function fakeStorage(persisted: boolean, grant = true) {
  const persist = vi.fn(async () => grant)
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { persisted: async () => persisted, persist },
  })
  return persist
}

describe("UpdateBanner", () => {
  it("names the app and Update installs the waiting version", () => {
    const apply = vi.fn()
    render(<UpdateBanner apply={apply} />)
    expect(screen.getByRole("status").textContent).toContain("Ghosted")
    fireEvent.click(screen.getByRole("button", { name: updateReadyText.update }))
    expect(apply).toHaveBeenCalledTimes(1)
  })
})

describe("PersistStatus", () => {
  it("says nothing when the browser cannot report", async () => {
    const { container } = render(<PersistStatus />)
    await act(async () => {})
    expect(container.textContent).toBe("")
  })

  it("says the data is kept when the browser already promised", async () => {
    fakeStorage(true)
    render(<PersistStatus />)
    expect(await screen.findByText(persistText.protected)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("warns, asks only on a click, and shows the new state when granted", async () => {
    const persist = fakeStorage(false, true)
    render(<PersistStatus />)
    expect(await screen.findByText(persistText.atRisk)).toBeTruthy()
    expect(persist).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: persistText.ask }))
    expect(persist).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(persistText.protected)).toBeTruthy()
  })

  it("points to Back up when the browser refuses", async () => {
    fakeStorage(false, false)
    render(<PersistStatus />)
    fireEvent.click(await screen.findByRole("button", { name: persistText.ask }))
    expect(await screen.findByText(persistText.refused)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("registerApp", () => {
  it("does nothing outside a production build", () => {
    const register = vi.fn()
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } })
    registerApp(false, "/")
    expect(register).not.toHaveBeenCalled()
    Reflect.deleteProperty(navigator, "serviceWorker")
  })

  it("registers /sw.js in production", () => {
    const register = vi.fn(async () => {
      throw new Error("stop here")
    })
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } })
    registerApp(true, "/")
    expect(register).toHaveBeenCalledWith("/sw.js")
    Reflect.deleteProperty(navigator, "serviceWorker")
  })
})

describe("installable files in public/", () => {
  const file = (path: string) => `${process.cwd()}/public/${path}`
  const pngSize = (path: string) => {
    const bytes = readFileSync(file(path))
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  }

  it("has the icons the manifest names, at their stated sizes", () => {
    expect(pngSize("icons/icon-192.png")).toEqual([192, 192])
    expect(pngSize("icons/icon-512.png")).toEqual([512, 512])
    expect(pngSize("icons/maskable-512.png")).toEqual([512, 512])
    expect(pngSize("icons/apple-touch-icon.png")).toEqual([180, 180])
  })

  it("never lets the service worker be cached", () => {
    const headers = readFileSync(file("_headers"), "utf8")
    expect(headers).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/)
  })
})
