/// <reference path="../pb_data/types.d.ts" />
// Dek Live, no accounts: anyone using Dek may run polls, and every question
// is kept with its answers for good.
//
// Who controls a session without logins: Dek creates a random secret `key`
// when it starts a session and sends it as the `X-Dek-Key` header from then
// on. Only the key holder can add, open and close the session's polls and see
// its votes. The key is a hidden field — never returned by the API.
//
// Nothing can be deleted through the API (only the superuser can, in the admin
// UI), and a poll's question and options can't change once created
// (pb_hooks/dek.pb.js), so every answer stays tied to the question asked.
migrate(
  (app) => {
    const KEY = '@request.headers.x_dek_key'

    const sessions = app.findCollectionByNameOrId('sessions')
    sessions.fields.removeByName('owner')
    sessions.fields.add(
      new TextField({ name: 'key', required: true, hidden: true, min: 32, max: 64, pattern: '^[A-Za-z0-9_-]+$' }),
    )
    sessions.listRule = null // not public: the data is the point
    sessions.viewRule = '' // anyone with the join link's id
    sessions.createRule = ''
    sessions.updateRule = `key = ${KEY}`
    sessions.deleteRule = null
    app.save(sessions)

    const polls = app.findCollectionByNameOrId('polls')
    polls.listRule = `open = true || session.key = ${KEY}`
    polls.viewRule = `open = true || session.key = ${KEY}`
    polls.createRule = `session.key = ${KEY}`
    polls.updateRule = `session.key = ${KEY}`
    polls.deleteRule = null
    app.save(polls)

    const votes = app.findCollectionByNameOrId('votes')
    // Self-describing rows: the question and the chosen answer as text, filled
    // in by the server (pb_hooks/dek.pb.js), so an export reads on its own.
    votes.fields.add(new TextField({ name: 'question', max: 300 }))
    votes.fields.add(new TextField({ name: 'label', max: 200 }))
    votes.listRule = `poll.session.key = ${KEY}`
    votes.viewRule = `poll.session.key = ${KEY}`
    votes.createRule = 'poll.open = true'
    votes.updateRule = null
    votes.deleteRule = null
    app.save(votes)

    // No accounts any more.
    try {
      app.delete(app.findCollectionByNameOrId('presenters'))
    } catch {
      /* already gone */
    }

    // Anyone may call it, so cap requests per address.
    const settings = app.settings()
    settings.rateLimits.enabled = true
    settings.rateLimits.rules = [
      { label: '*:create', maxRequests: 30, duration: 10 },
      { label: '/api/', maxRequests: 300, duration: 10 },
    ]
    app.save(settings)
  },
  () => {
    /* one-way: the account-based setup isn't restored */
  },
)
