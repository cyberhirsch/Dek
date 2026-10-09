/// <reference path="../pb_data/types.d.ts" />
// Dek Live: a session is a presentation on a date.
//
// Dek derives the session's id from the date and the presentation's name, so
// the same deck on the same day is always the same session: a browser reload
// mid-lecture carries on, and a QR code shown that day stays valid all day.
// Every row also carries the date and name as text (`day`, `deck`), so the
// data can be grouped by lecture without decoding ids.
migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId('sessions')
    sessions.fields.add(new TextField({ name: 'deck', required: true, max: 200 }))
    sessions.fields.add(new TextField({ name: 'day', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' }))
    app.save(sessions)

    const polls = app.findCollectionByNameOrId('polls')
    polls.fields.add(new TextField({ name: 'deck', max: 200 }))
    polls.fields.add(new TextField({ name: 'day', max: 10 }))
    // the same poll, asked again in the same session, is reused, not copied
    polls.addIndex('idx_polls_once', true, 'session, slide, question', '')
    app.save(polls)

    const votes = app.findCollectionByNameOrId('votes')
    votes.fields.add(new TextField({ name: 'deck', max: 200 }))
    votes.fields.add(new TextField({ name: 'day', max: 10 }))
    app.save(votes)
  },
  () => {
    /* one-way */
  },
)
