/// <reference path="../pb_data/types.d.ts" />
// Dek Live server rules beyond what table permissions can say.

// A session's secret key arrives as the X-Dek-Key header, like on every later
// request: hidden fields can't be written by API callers, so the server copies
// it in. A key too short to be unguessable is refused.
onRecordCreateRequest((e) => {
  const key = String(e.requestInfo().headers['x_dek_key'] || '')
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(key)) throw new BadRequestError('Send a random X-Dek-Key of 32–64 characters.')
  e.record.set('key', key)
  e.next()
}, 'sessions')

// A vote must fit its poll: a choice is an option's number, a scale vote is
// 1–5, words are a short trimmed phrase. Anything else is refused, so the
// table only ever holds clean answers. The vote also gets the question and
// the answer as text, so each row describes itself.
onRecordCreateRequest((e) => {
  const poll = $app.findRecordById('polls', e.record.getString('poll'))
  if (!poll.getBool('open')) throw new BadRequestError('This poll is closed.')
  const answer = String(e.record.getString('answer')).trim()
  const kind = poll.getString('kind')
  let label = answer
  if (kind === 'choice') {
    let options = []
    try {
      options = JSON.parse(poll.getString('options') || '[]')
    } catch (_) {
      options = []
    }
    if (!/^\d+$/.test(answer) || Number(answer) >= options.length) throw new BadRequestError('Not one of the options.')
    label = String(options[Number(answer)])
  } else if (kind === 'scale') {
    if (!/^[1-5]$/.test(answer)) throw new BadRequestError('Pick 1 to 5.')
  } else if (!answer || answer.length > 40) {
    throw new BadRequestError('One short word or phrase, please.')
  }
  e.record.set('answer', answer)
  e.record.set('label', label.slice(0, 200))
  e.record.set('question', poll.getString('question'))
  e.record.set('deck', poll.getString('deck'))
  e.record.set('day', poll.getString('day'))
  e.next()
}, 'votes')

// A poll carries its presentation's name and date too (see the session).
onRecordCreateRequest((e) => {
  const session = $app.findRecordById('sessions', e.record.getString('session'))
  e.record.set('deck', session.getString('deck'))
  e.record.set('day', session.getString('day'))
  e.next()
}, 'polls')

// A poll's question, kind and options are fixed once it exists — only opening
// and closing it is allowed — so its answers always belong to the question
// that was actually asked.
onRecordUpdateRequest((e) => {
  const before = $app.findRecordById('polls', e.record.id)
  for (const f of ['session', 'slide', 'question', 'kind', 'options', 'deck', 'day']) {
    if (String(before.get(f)) !== String(e.record.get(f))) throw new BadRequestError('A poll can only be opened or closed.')
  }
  e.next()
}, 'polls')
