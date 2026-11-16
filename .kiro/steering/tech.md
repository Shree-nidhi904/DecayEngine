# Tech Stack

## Language

TypeScript everywhere, strict mode enabled.

## Repository

pnpm workspaces monorepo.

## Engine

Pure TypeScript. No UI. No framework dependencies.

## Apps and Shell

React with Vite.

## Tests

- **Vitest** for unit tests
- **fast-check** for property-based tests

## Storage

Browser local storage behind an adapter interface. No accounts, no login, no database.

## Server

Small serverless functions on Vercel. Used only by Link Cemetery for link checking.

## Hosting

One Vercel site. Each app lives at its own path.
