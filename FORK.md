# Fork-local patches

This fork tracks `pingdotgg/t3code` and carries only the patches below. This
file is the complete inventory. Nothing else in this tree is intentionally
divergent from upstream.

## Remotes

```
origin    https://github.com/JacobDeuchert/t3code   (this fork)
upstream  https://github.com/pingdotgg/t3code       (canonical)
```

The fork's `main` is `upstream/main` plus the fork commits on top. It is
rebased onto upstream, never merged, so history matches upstream exactly up to
that commit. Pushes to `origin/main` are therefore force pushes. The full patch
set at any time is `git diff upstream/main...main`.

## Upgrade procedure

```sh
git fetch upstream --tags --prune
git rebase upstream/main
```

Each entry lists its conflict risk. Fix what broke per its entry, amend the
fork commit it belongs to, update the entry's `upstream base` line, then:

```sh
git push --force-with-lease origin main
```

---

## 0001 Nix flake

status: active

upstream base: `e057f7a770` (2026-11-25)

local files:

- `flake.nix`
- `flake.lock`
- `.gitignore` (the `/result` and `/result-*` lines at the end)

reason: NixOS has no upstream packaging. The flake provides `packages.desktop`
(Electron app, the default), `packages.server` (headless `t3` CLI + web UI),
`packages.resource-monitor`, and dev shells `default` and `server` for nix-ld.

conflict risk: none for merges, since upstream never touches these files. The
breakage is silent: upstream changes that invalidate the flake show up only at
build time. After every merge expect to fix:

- **pnpm dependency hashes.** Any change to `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `patches/`, `.pnpmfile.cjs` or a `package.json` changes
  both `fetchPnpmDeps` hashes (desktop and server). Build
  `.#desktop.pnpmDeps` and `.#server.pnpmDeps` with `--rebuild`, copy the
  `got:` hashes in. Without `--rebuild` a stale hash still "succeeds" by
  reusing the old store path; if the deps were never built, `--rebuild` errors
  instead, so build plainly to get the mismatch. After updating, build without
  `--rebuild`.
- **Vendored `file:` tarballs.** `dependencyManifests` must contain every
  `file:*.tgz` dependency, or the pnpm fetch fails with ENOENT. Currently
  `apps/web/deps/*.tgz` (`@pierre/words`, added upstream 2026-11). If
  upstream vendors a tarball elsewhere, add that directory too.
- **SPDX license cache hash.** The revision is read from
  `scripts/lib/third-party-licenses.ts`; when upstream bumps
  `SPDX_LICENSE_LIST_REVISION`, update `spdxLicenseDetails.hash`.
- **Node / pnpm versions.** The flake pins `nodejs_26` and overrides `pnpm_11`
  to build against it. Follow upstream's `engines` when they bump.
- **Workspace names.** `desktopWorkspaces` / `serverWorkspaces` name pnpm
  projects; renames upstream break the filtered install.

remove when: upstream ships its own Nix packaging.

verification:

```sh
nix build --no-link .#server
nix build --no-link .#desktop
```

---

## 0002 Disable agent issue tools

status: active

upstream base: `e057f7a770` (2026-11-25)

local files:

- `packages/shared/src/FeatureFlags.ts` (`disable_issue_tools` flag and
  `issueToolsDisabled()`)
- `apps/server/src/mcp/McpHttpServer.ts` (`layerIssuesToolkit` registers
  nothing when the flag is on)
- `packages/provider-core/src/server/runtimeInstructions.ts`
  (`withoutIssueLinking` wraps `PULL_REQUEST_LINKING_INSTRUCTIONS`)

usage: start the server or desktop app with
`T3CODE_FEATURE_FLAGS=disable_issue_tools` (comma-separate it from other
flags). The flag is read once at startup, so changing it needs a restart.
The desktop app takes the variable from the login shell environment.

reason: upstream gives every agent, for every harness, the T3 issue tools
(`link_issue`, `create_issue`, `list_issues`, …) plus an instruction to call
`link_issue` for every issue it files, "even via CLI". We track work in `tk`
and Redmine, which T3 cannot link, so agents filed a Redmine ticket, tried to
link it, failed and reported "no issue tracker". The flag drops the issue
toolkit from the MCP server and removes the `link_issue` line from the
runtime instructions. Harness deny lists would need upkeep per provider; this
covers all of them. The issue UI in the web client is untouched.

conflict risk: low. The edits are a few lines around stable names. Watch for:

- `layerIssuesToolkit` renamed or the issues toolkit split. Re-wrap whatever
  `layerTools` registers for issues.
- New issue-related lines in the runtime instructions. `withoutIssueLinking`
  drops every line that mentions `link_issue`; if upstream adds instructions
  for other issue tools, extend the filter.
- Upstream adding its own way to turn the tools off: switch to it and drop
  this entry.

remove when: upstream only offers issue tools for projects with a connected
tracker, or offers a setting to turn them off.

verification: with the flag set, an agent's T3 tool list has no `*_issue*`
tools and its instructions don't mention `link_issue`. Quick check from
`apps/server`:

```sh
T3CODE_FEATURE_FLAGS=disable_issue_tools node -e 'import("@t3tools/provider-core/server/runtimeInstructions").then((m) => console.log(m.PULL_REQUEST_LINKING_INSTRUCTIONS.includes("link_issue")))'
```

prints `false`.
