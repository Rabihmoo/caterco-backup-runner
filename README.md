# Backup runner

A small, operations-only repository that runs a daily encrypted database backup on a standard GitHub-hosted runner for one small website. It contains **no application code, no data, no keys and no credentials**.

## What it does

1. Fetches a private tools repository at one pinned commit onto the ephemeral runner, using a read-only deploy key (not persisted).
2. Takes a consistent logical backup of the production database over verified TLS.
3. Encrypts the backup on the runner with a **public** key (kept as a masked secret); the matching private key is kept offline by the owner and never reaches this repository or the runner.
4. Stores the encrypted files in a private Cloudflare KV store (14 daily plus 8 weekly copies) and checks that the new backup is retrievable.
5. A separate freshness job lists key names in that store and fails if the newest complete backup is older than 36 hours.

## What is public here

The workflow files and their run logs. The output of **our own tools** is written to private files on the runner and discarded with it; our steps print only fixed status lines such as `backup ok` or `FAILED: backup step (details withheld from public logs)`. That is not the whole log: GitHub's standard checkout and setup actions, and the package installer, print their usual output, and the checkout of the private tools repository shows the pinned commit hash and its commit message. The encryption public key is stored as a masked environment secret. Nothing is uploaded as an Actions artifact, cache or release. The first runs' complete public logs are inspected for leakage before the schedule is relied on.

## Triggers

Only the daily schedule and a manual run by the repository owner. The schedule is **off** until the repository variable `BACKUP_SCHEDULE_ENABLED` is set to `true`. There are no pull-request, workflow-run or user-supplied-input triggers, so contributed code never runs with secrets.

## Limits you should know about

* GitHub may delay or drop scheduled runs, and disables scheduled workflows in a public repository after 60 days without repository activity. The owner must keep the repository active (or re-enable it) and watch the freshness job.
* The freshness job runs from the same scheduler as the backup, so it cannot detect that the scheduler itself stopped.
* A successful run proves that one backup was taken and stored; restores are verified separately by the owner with the offline key.

## Files

* `.github/workflows/runner-probe.yml` – manual probe with no secrets; proves only that a runner can start.
* `.github/workflows/backup.yml` – the backup and freshness jobs.
* `scripts/kv-freshness.mjs` – the freshness check (reads key names only).
