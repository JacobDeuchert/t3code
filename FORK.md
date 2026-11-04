# Fork-local patches

This fork tracks `pingdotgg/t3code` and carries only the Nix flake below. This
file is the complete inventory. Nothing else in this tree is intentionally
divergent from upstream.

## Remotes

```
origin    https://github.com/JacobDeuchert/t3code   (this fork)
upstream  https://github.com/pingdotgg/t3code       (canonical)
```

The fork's `main` is `upstream/main` plus a single fork commit on top. It is
rebased onto upstream, never merged, so history matches upstream exactly up to
that commit. Pushes to `origin/main` are therefore force pushes. The full patch
set at any time is `git diff upstream/main...main`.

## Upgrade procedure

```sh
git fetch upstream --tags --prune
git rebase upstream/main
```

The fork commit touches only fork-owned files, so the rebase does not conflict
unless upstream adds its own `flake.nix` or edits the end of `.gitignore`. Fix
the flake per the entry below, amend the fork commit, update the entry's
`upstream base` line, then:

```sh
git push --force-with-lease origin main
```

---

## 0001 Nix flake

status: active

upstream base: `9cd7a04797` (2026-11-10)

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
  reusing the old store path. After updating, build without `--rebuild`.
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
