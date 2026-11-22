---
inclusion: always
---

# Shell Commands

The project lives in WSL, and commands run from Kiro often fail or return no output. Follow these rules for every command.

1. **One command per call.** No long `&&` chains and no heredocs.

2. **Long output goes to a file.** For anything that prints a lot or takes more than a few seconds, redirect the output to a file and read the file in a second call:

   ```
   pnpm --filter @decay-engine/ghosted test > /tmp/out.log 2>&1; echo EXIT $? >> /tmp/out.log
   ```

3. **Long-running work runs in the background.** Tests, builds and servers run with `nohup` and log to a file. Wait for them with `tail --pid=<pid> -f /dev/null`. Do not poll in a loop.

4. **Never change git config.** Use `git --no-pager` or `GIT_PAGER=cat` on each command instead.

5. **Stop after two identical failures.** If a command fails the same way twice, stop retrying. Report the exact command and its output, then either continue with file edits only or ask the developer to run it. Never try a third variant.

6. **Never start a server.** Never run anything that listens on a port or host (for example `vite`, `vite preview`, `pnpm dev`, `netlify dev`, `npx serve`). To test in a browser, either ask the developer to start the server in their own terminal, or make a draft deploy with `netlify deploy --build` (never `--prod`) and test that URL.
