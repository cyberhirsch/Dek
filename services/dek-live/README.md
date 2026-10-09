# Dek Live — voting server on the Pi

Live polls for lectures: students scan the QR code on a poll slide, vote on
their phones (no login, no app), and the result appears on the slide. This is
the server side: its **own** PocketBase, separate from every other database on
the Pi, at **https://dek.sebhirsch.com** through its own Cloudflare tunnel.

| | |
|---|---|
| Container | `dek-live-pb` (PocketBase) + `dek-live-tunnel` (cloudflared) |
| Folder on the Pi | `/media/cyberhirsch/SSD/Data/DekLive/` |
| LAN admin | `http://192.168.178.66:8092/_/` |
| Public | `https://dek.sebhirsch.com` |

## What's stored

No accounts: anyone using Dek can run a live session. Everything is **kept**
— questions with their answers are the valuable part — and nothing can be
deleted through the API; only the superuser can, in the admin UI.

| Table | Holds | Who may read / write |
|---|---|---|
| `sessions` | one per presentation **per day**; `deck`, `day`, `title` | read: anyone with its id (the join link) · add: anyone · list: nobody |
| `polls` | question, kind (`choice` / `words` / `scale`), options, open; `deck`, `day` | read: open polls, or the session's key holder · add / open / close: the key holder |
| `votes` | anonymous phone token, answer, and as text: `question`, `label` (the chosen answer), `deck`, `day` | add: anyone, only while the poll is open, one per phone · read: the key holder |

- **Session id = date + presentation.** Dek derives it from the date and the
  deck's name, so the same deck on the same day is the same session: a reload
  mid-lecture carries on, and that day's QR code stays valid.
- **The key.** Dek makes a random secret when it starts a session and sends it
  as the `X-Dek-Key` header. Only its holder adds, opens and closes the
  session's polls and sees its votes. The key is a hidden field — never
  returned by the API.
- **Fixed questions.** A poll's question and options can't change once it
  exists, so every answer belongs to the question actually asked. The same
  poll asked again in the same session is reused, not copied.
- **Clean answers.** Votes are checked against their poll (`pb_hooks/dek.pb.js`).
- **Privacy.** No names, no IP addresses. Requests are rate-limited per address.

## Deploy (once)

1. **Tunnel** — Cloudflare dashboard → Zero Trust → Networks → Tunnels →
   *Create a tunnel* → Cloudflared → name it `dek-live`. Copy the token.
   Add a **public hostname**: `dek.sebhirsch.com` → service `HTTP` →
   `dek-live-pb:8090`.
2. **Files** — copy this folder to the Pi:
   ```bash
   scp -r services/dek-live cyberhirsch@192.168.178.66:/media/cyberhirsch/SSD/Data/DekLive
   ```
3. **Token** — on the Pi:
   ```bash
   cd /media/cyberhirsch/SSD/Data/DekLive
   cp .env.example .env
   nano .env        # paste the token after TUNNEL_TOKEN=
   chmod 600 .env
   ```
4. **Start** — `docker compose up -d`, then `docker logs dek-live-pb` should
   show the migration applied and the server listening.
5. **Superuser** (the database admin — to look at and export the data; Dek
   itself needs no account):
   ```bash
   docker exec -it dek-live-pb pocketbase superuser upsert you@example.com 'a-new-password'
   ```
6. **Check** — `https://dek.sebhirsch.com/api/health` answers `{"code":200,…}`.

Optional: put the admin UI path `/_/*` behind Cloudflare Access (Zero Trust →
Access → Applications) so the login page isn't reachable from the internet at
all. The LAN address keeps working either way.

## Updating

```bash
cd /media/cyberhirsch/SSD/Data/DekLive
docker compose pull && docker compose up -d
```

## Backup

Stop first, then copy the whole data folder (the `.db` files and their
`-wal`/`-shm` companions belong together):

```bash
docker compose stop dek-live-pb
cp -a pb_data ~/backups/dek-live-$(date +%F)
docker compose start dek-live-pb
```
