/// <reference path="../pb_data/types.d.ts" />
// Dek Live: the four tables, created on first start.
//
//   presenters  login accounts — only you; nobody can sign up
//   sessions    one per lecture, owned by a presenter; its id is in the join link
//   polls       one per poll slide: question, kind, options, open/closed
//   votes       one per phone per poll: anonymous device token + answer
//
// Students never log in. They can read a session and its open polls, and add
// a vote while a poll is open — nothing else. Votes, results and all editing
// are the presenter's alone. No names and no IP addresses are stored.
migrate(
  (app) => {
    const presenters = new Collection({
      type: 'auth',
      name: 'presenters',
      listRule: 'id = @request.auth.id',
      viewRule: 'id = @request.auth.id',
      createRule: null, // no sign-up: accounts are made in the admin UI
      updateRule: 'id = @request.auth.id',
      deleteRule: null,
      fields: [{ name: 'name', type: 'text', max: 100 }],
    })
    app.save(presenters)

    const sessions = new Collection({
      type: 'base',
      name: 'sessions',
      listRule: 'owner = @request.auth.id',
      viewRule: '', // anyone with the join link's id
      createRule: "@request.auth.collectionName = 'presenters' && owner = @request.auth.id",
      updateRule: 'owner = @request.auth.id',
      deleteRule: 'owner = @request.auth.id',
      fields: [
        { name: 'owner', type: 'relation', collectionId: presenters.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'title', type: 'text', max: 200 },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_sessions_created ON sessions (created)'],
    })
    app.save(sessions)

    const polls = new Collection({
      type: 'base',
      name: 'polls',
      // phones see a session's open polls; the presenter sees all of theirs
      listRule: 'open = true || session.owner = @request.auth.id',
      viewRule: 'open = true || session.owner = @request.auth.id',
      createRule: 'session.owner = @request.auth.id',
      updateRule: 'session.owner = @request.auth.id',
      deleteRule: 'session.owner = @request.auth.id',
      fields: [
        { name: 'session', type: 'relation', collectionId: sessions.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'slide', type: 'number', onlyInt: true, min: 0 },
        { name: 'question', type: 'text', max: 300 },
        { name: 'kind', type: 'select', values: ['choice', 'words', 'scale'], maxSelect: 1, required: true },
        { name: 'options', type: 'json', maxSize: 4000 },
        { name: 'open', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_polls_session ON polls (session)'],
    })
    app.save(polls)

    const votes = new Collection({
      type: 'base',
      name: 'votes',
      listRule: 'poll.session.owner = @request.auth.id',
      viewRule: 'poll.session.owner = @request.auth.id',
      createRule: 'poll.open = true', // checked again, with the answer, in pb_hooks/dek.pb.js
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'poll', type: 'relation', collectionId: polls.id, maxSelect: 1, required: true, cascadeDelete: true },
        // a random token the phone keeps for itself — one vote per phone per poll
        { name: 'voter', type: 'text', required: true, pattern: '^[A-Za-z0-9_-]{16,64}$' },
        { name: 'answer', type: 'text', required: true, max: 60 },
        { name: 'created', type: 'autodate', onCreate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_votes_poll_voter ON votes (poll, voter)'],
    })
    app.save(votes)
  },
  (app) => {
    for (const name of ['votes', 'polls', 'sessions', 'presenters']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch {
        /* already gone */
      }
    }
  },
)
