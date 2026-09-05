# Self-hosting Task Bucket

> **This is Path B.** If you just want the app online, [DEPLOY.md](DEPLOY.md)
> puts it on Vercel and Neon in about half an hour and needs no payment method
> at all. Come here when you want to own the whole stack — because you are
> charging for it (Vercel's free tier is non-commercial), because you need more
> than the free tiers allow, or because you would rather run your own server.

This guide takes you from nothing to a running, HTTPS-secured install on a
single Linux server, with deploys happening automatically on every push to
`main`.

**It is not AWS-specific.** All this needs is one Ubuntu 24.04 machine you can
reach over SSH — a $5/month VPS from any provider works exactly the same, and
many regional providers take local bank transfers or mobile wallets. The AWS
instructions in Step 1 are just one worked example; skip to Step 2 if you
already have a server.

It assumes no prior server experience. Run the commands exactly as written
unless the text says to substitute something.

---

## What you are building

```
                    +--------------------- your server ----------------------+
  browser --HTTPS-->|  Caddy  -->  app (Next.js)  -->  Postgres              |
                    |  (TLS)       :3000               (docker volume)       |
                    +-------------------------------------------------------+
        ^                                   ^
        |                                   | pulls the image it built
    your domain                    GitHub Actions (on push to main)
```

Everything runs as Docker containers described by `docker-compose.prod.yml`.
Caddy gets a free Let's Encrypt certificate on first start and renews it by
itself — there is nothing to schedule and nothing that expires on you.

**One important limitation, by design:** this is a single server. If it dies,
the app is down until you rebuild it (see [Disaster recovery](#disaster-recovery)).
That is the right trade-off at the start; the last section says what to change
when it stops being.

---

## Before you start

You need four things. Three are free.

| What | Where | Cost |
|---|---|---|
| A domain name | Namecheap, Cloudflare, Porkbun… | ~$10/year |
| An AWS account | <https://aws.amazon.com> | Free to open |
| The GitHub repo | Already at <https://github.com/RababKhan/Task-Bucket> | Free |
| A Resend account (email) | <https://resend.com> | Free tier: 3,000 emails/month |

Email is not optional: invitations, password resets and signup codes all go
through it. Without a working email provider, nobody but you can join.

---

## Step 1 — Launch the server

1. Sign in to the AWS Console and search for **EC2**. Pick your region from the
   top-right menu first — choose the one closest to your users; **you cannot
   move an instance between regions later.**
2. **Launch instance**.
3. Fill it in:
   - **Name:** `task-bucket`
   - **Application and OS Image:** Ubuntu Server 24.04 LTS (64-bit x86)
   - **Instance type:** `t3.micro` to start. 1 GB of RAM is genuinely tight —
     the setup script adds 2 GB of swap to compensate. If the app feels slow
     under real use, `t3.small` (2 GB) is the upgrade, and you can resize later
     without rebuilding.
   - **Key pair:** *Create new key pair* → name it `task-bucket-key`, type
     **RSA**, format **.pem** → Create. Your browser downloads
     `task-bucket-key.pem`.
     **Save this file somewhere safe. It cannot be downloaded again, and
     without it you cannot log in to your own server.**
   - **Network settings** → Edit → allow, from *Anywhere*:
     - SSH (port 22)
     - HTTP (port 80)
     - HTTPS (port 443)
   - **Storage:** change 8 GB to **20 GB** gp3. Docker images and the database
     will not comfortably fit in 8.
4. **Launch instance**, then open the instance and copy its **Public IPv4
   address**.

> **Restricting SSH:** allowing port 22 from anywhere means the whole internet
> can attempt to log in. Key-only auth makes that impractical to break, but if
> your home connection has a stable IP, set the SSH rule to *My IP* instead.

### Give the server a fixed address

By default the public IP changes if the instance is ever stopped and started,
which would silently break your DNS. Pin it:

EC2 → **Elastic IPs** → *Allocate Elastic IP address* → Allocate → select it →
*Actions* → *Associate* → choose your instance → Associate.

Use this Elastic IP everywhere below. **Keep it associated with a running
instance** — AWS charges for Elastic IPs that sit unused.

---

## Step 2 — Point your domain at it

At your domain registrar, open the DNS settings and add:

| Type | Name | Value |
|---|---|---|
| A | `@` | your Elastic IP |
| A | `www` | your Elastic IP |

Leave TTL at the default. Wait a few minutes, then check from your own machine:

```bash
nslookup yourdomain.com
```

The answer must show your Elastic IP before you go on. **Caddy cannot get a
certificate until DNS resolves**, and repeated failures hit Let's Encrypt rate
limits, which lock you out for hours.

---

## Step 3 — Connect and set up the server

From your machine (in Git Bash on Windows), where `KEY.pem` is the file you
downloaded and `SERVER_IP` is your Elastic IP:

```bash
chmod 400 /path/to/task-bucket-key.pem
ssh -i /path/to/task-bucket-key.pem ubuntu@SERVER_IP
```

Answer `yes` to the fingerprint prompt. You are now on the server.

Run the setup script. It installs Docker, adds swap, turns on the firewall and
enables automatic security updates:

```bash
curl -fsSL https://raw.githubusercontent.com/RababKhan/Task-Bucket/main/deploy/bootstrap.sh -o bootstrap.sh
less bootstrap.sh
bash bootstrap.sh
```

(Read it first with `less` — never pipe a script from the internet straight
into bash.)

When it finishes, log out and back in so your user picks up Docker access:

```bash
exit
ssh -i /path/to/task-bucket-key.pem ubuntu@SERVER_IP
docker run --rm hello-world
```

That should print "Hello from Docker!".

---

## Step 4 — Put the app's files on the server

```bash
cd /opt/task-bucket
git clone https://github.com/RababKhan/Task-Bucket.git repo
cp repo/docker-compose.prod.yml .
mkdir -p deploy
cp repo/deploy/Caddyfile repo/deploy/backup.sh repo/deploy/restore.sh deploy/
cp repo/.env.prod.example .env.prod
chmod 600 .env.prod
```

### Generate your secrets

```bash
echo "AUTH_SECRET:       $(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD: $(openssl rand -base64 32)"
```

Copy both values somewhere safe, then edit the config:

```bash
nano .env.prod
```

Fill in at minimum:

```ini
APP_DOMAIN=yourdomain.com
LETSENCRYPT_EMAIL=you@yourdomain.com

POSTGRES_PASSWORD=<the generated password>

AUTH_SECRET=<the generated secret>
AUTH_URL=https://yourdomain.com
AUTH_TRUST_HOST=true

RESEND_API_KEY=<from resend.com>
EMAIL_FROM=Task Bucket <no-reply@yourdomain.com>

SUPERADMIN_EMAILS=you@yourdomain.com

APP_IMAGE=ghcr.io/rababkhan/task-bucket:latest
MIGRATOR_IMAGE=ghcr.io/rababkhan/task-bucket-migrator:latest
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

Notes on the values that catch people out:

- **`AUTH_SECRET`** signs session cookies. Changing it later signs everyone out.
- **`AUTH_URL`** must be the exact `https://` address people type. If it is
  wrong, sign-in redirects fail with a confusing error.
- **`EMAIL_FROM`** must use a domain you have **verified in Resend** (their
  dashboard walks you through adding DNS records). Until then Resend only
  delivers to your own account address — this is the single most common cause
  of "the invite never arrived".
- **`SUPERADMIN_EMAILS`** grants the platform-admin section. Put your own email
  here.

---

## Step 5 — Set up automatic deploys

The images are built by GitHub Actions and pulled by the server, so the server
never needs to build anything (it does not have the memory to).

### 5a. Let the server log in to the registry

If your GitHub repo is **public**, skip this — public images pull anonymously.

If it is **private**, create a token at <https://github.com/settings/tokens> →
*Generate new token (classic)* → scope **`read:packages`** only → copy it, then
on the server:

```bash
echo "YOUR_TOKEN" | docker login ghcr.io -u RababKhan --password-stdin
```

### 5b. Create a deploy key for GitHub Actions

On the **server**, make a key pair whose private half GitHub will use to log in:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-actions"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy
```

That last command prints the **private** key. Copy the whole thing, including
the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`
lines.

### 5c. Add the secrets to GitHub

In the repo: **Settings → Secrets and variables → Actions → New repository
secret**. Add three:

| Name | Value |
|---|---|
| `SSH_HOST` | your Elastic IP |
| `SSH_USER` | `ubuntu` |
| `SSH_KEY` | the private key you just copied |

Then the **Variables** tab → *New repository variable*:

| Name | Value |
|---|---|
| `WORKSPACE_DOMAIN` | `yourdomain.com` |

(That last one is only the suffix shown after a workspace subdomain on the
signup form — see [About workspace subdomains](#about-workspace-subdomains).)

Finally, **Settings → Environments → New environment → `production`**. Leave it
empty for now; adding a *required reviewer* here later will make every deploy
pause for your approval.

> **Never paste secrets into a file in the repo, a commit message, or a chat.**
> GitHub secrets are write-only: once saved, nobody (including you) can read
> them back, which is exactly what you want.

---

## Step 6 — First launch

You can wait for the first push to `main` to deploy for you, or start it by
hand right now. By hand, on the server:

```bash
cd /opt/task-bucket
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Watch it come up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f caddy
```

Caddy logs the certificate being issued. Once that is done, open
`https://yourdomain.com` — you should get the sign-up page on a valid
certificate.

Check the health endpoint too:

```bash
curl https://yourdomain.com/api/health
```

It should answer `{"status":"ok","database":"up","latencyMs":3}`.

**Create your account immediately.** The first person to sign up creates the
first workspace and becomes its Owner.

---

## Day-to-day operation

Every command below runs from `/opt/task-bucket`. To save typing:

```bash
echo "alias tb='docker compose -f /opt/task-bucket/docker-compose.prod.yml --env-file /opt/task-bucket/.env.prod'" >> ~/.bashrc
source ~/.bashrc
```

Then:

| Task | Command |
|---|---|
| What is running | `tb ps` |
| Follow the app logs | `tb logs -f app` |
| Restart the app | `tb restart app` |
| Stop everything | `tb down` |
| Start everything | `tb up -d` |
| Open a database shell | `tb exec db psql -U postgres -d task_bucket` |
| Disk space | `df -h` |
| Memory / swap | `free -h` |

### Deploying a change

Push to `main`. That is the whole process — Actions runs the typecheck and unit
tests, builds the images, pushes them, then tells the server to pull, migrate
and restart. Watch it under the repo's **Actions** tab.

If the app fails its health check after a deploy, the workflow fails and prints
the last 80 log lines.

### Rolling back

Each deploy writes the exact image tag into `.env.prod` and keeps the previous
five copies. To go back:

```bash
cd /opt/task-bucket
ls -1t .env.prod.bak.*
cp .env.prod.bak.<the one you want> .env.prod
tb up -d app
```

A rollback does **not** undo database migrations. If a release changed the
schema, restore a backup from before it as well.

---

## Backups

Nothing above protects you from a bad migration, a mistaken delete, or losing
the instance. Turn on nightly dumps:

```bash
crontab -e
```

Add this line (backups at 03:15 UTC, keeping 7 days):

```
15 3 * * * cd /opt/task-bucket && ./deploy/backup.sh >> backups/backup.log 2>&1
```

Test it once by hand rather than trusting it blindly:

```bash
cd /opt/task-bucket && ./deploy/backup.sh && ls -lh backups/
```

**A backup on the same disk as the database is only half a backup.** It covers
mistakes, not a lost server. Copy the dumps off the machine — the simplest
option is an S3 bucket: create one, attach an IAM role to the instance with
write access to it, then uncomment the `aws s3 cp` line in `deploy/backup.sh`.

To restore:

```bash
cd /opt/task-bucket
./deploy/restore.sh backups/task-bucket-YYYYMMDD-HHMMSS.sql.gz
```

It asks you to type the database name first, because it overwrites everything.

---

## Disaster recovery

If the instance is lost entirely, with a copy of your dumps and `.env.prod` you
can be back up in about 20 minutes:

1. Launch a new instance (Step 1) and move the Elastic IP to it.
2. Run the bootstrap script (Step 3) and copy the files across (Step 4).
3. Put your saved `.env.prod` back.
4. `tb up -d` and wait for the migrations to finish.
5. `./deploy/restore.sh <your latest dump>`.

Keep a copy of `.env.prod` somewhere safe and offline — a password manager, not
the repo.

---

## About workspace subdomains

The signup form shows a workspace's chosen subdomain as `acme.yourdomain.com`.
**This is presentation only.** Nothing in the app routes by hostname — every
workspace is served from your single domain, and access is decided by the
signed-in session.

So you do **not** need wildcard DNS or a wildcard certificate. Setting the
`WORKSPACE_DOMAIN` repository variable just makes that label read
`acme.yourdomain.com` instead of the `taskbucket.local` default.

If you later want subdomains to be real addresses, that is a genuine feature —
a wildcard DNS record, a wildcard certificate (DNS-01 challenge), and
host-based workspace resolution in `middleware.ts` — not a configuration
change.

---

## What this costs

On a new AWS account the first months are largely covered by the free tier, but
**AWS has changed its free-tier terms more than once**, so check the current
offer rather than trusting a number here. Budget roughly:

| Item | Rough monthly cost after any free period |
|---|---|
| t3.micro instance | ~$7–9 |
| 20 GB gp3 storage | ~$1.60 |
| Elastic IP (while attached) | $0 |
| Data transfer (small app) | ~$0–2 |
| Domain | ~$1/month amortised |
| Resend (under 3,000 emails/month) | $0 |

Set a billing alarm on day one: **Billing → Budgets → Create budget → Zero
spend** (or a $10 threshold). It emails you before a surprise becomes a bill.

---

## Troubleshooting

**The site shows "connection refused" or times out.**
Check the containers are up (`tb ps`) and that the EC2 security group really
allows 80 and 443 from anywhere.

**No certificate, or a browser warning.**
Caddy could not complete the ACME challenge. Almost always DNS: confirm
`nslookup yourdomain.com` returns your Elastic IP, then `tb logs caddy`.
Let's Encrypt rate-limits repeated failures for the same name — fix DNS before
retrying, rather than restarting in a loop.

**Sign-in redirects to the wrong place, or fails with `error=Configuration`.**
`AUTH_URL` does not match the address you visited, or `AUTH_SECRET` is unset.
Both live in `.env.prod`; run `tb up -d app` after editing.

**OAuth (GitHub/Google) fails but email sign-in works.**
The callback URL registered with the provider must be exactly
`https://yourdomain.com/api/auth/callback/github` (or `/google`). Also start
and finish the flow on the same hostname — beginning on the bare IP and
returning to the domain fails the PKCE check.

**Invitation emails never arrive.**
Check `tb logs app` for a send error. The usual cause is an unverified sending
domain in Resend, which silently limits delivery to your own address.

**The app is killed and restarts under load.**
Out of memory. Confirm with `free -h` that swap is active, then move to
`t3.small`: stop the instance, *Actions → Instance settings → Change instance
type*, start it again. The Elastic IP and your data survive.

**The disk filled up.**
`docker system prune -af` reclaims old images. Check
`du -sh /opt/task-bucket/backups` too — retention in `backup.sh` defaults to
7 days.

---

## When one server stops being enough

In rough order of value:

1. **Move the database to RDS.** Managed backups, point-in-time recovery, and
   the database stops sharing memory with the app. This is the first thing to
   change once real data matters.
2. **Add error monitoring** (Sentry has a free tier) so you learn about
   failures from an alert rather than from a user.
3. **Add uptime monitoring** against `/api/health` — UptimeRobot is free and
   takes two minutes.
4. **Run two app instances behind a load balancer.** Sessions are JWTs, so the
   app layer scales horizontally without extra work.
5. **Add Redis** only when you actually need shared caching or cross-instance
   rate limiting. Rate limiting currently lives in Postgres precisely so there
   is one fewer service to operate.

---

## Running the whole stack locally

Unrelated to production, but useful:

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

Fill in `AUTH_SECRET` at minimum. The app runs on <http://localhost:3000>, and
every outgoing email is caught by Mailpit at <http://localhost:8025> instead of
being sent.
