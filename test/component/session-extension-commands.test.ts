import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakePiRpcProcess, asAgentConn } from '../helpers/fakes.js'

function makeSession(proc: FakePiRpcProcess) {
  return new PiAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(new FakeAgentSideConnection()),
    fileCommands: []
  })
}

test('PiAcpSession: a prompt pi handles without a run (extension command) ends the turn', async () => {
  const proc = new FakePiRpcProcess()
  proc.promptDisposition = 'handled'
  const session = makeSession(proc)

  // pi emits no agent_start/agent_settled for a handled command.
  assert.equal(await session.prompt('/my-command'), 'end_turn')

  // The session is free again: the next prompt starts at once, not queued.
  proc.promptDisposition = 'started'
  const next = session.prompt('hello')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(proc.prompts.length, 2)
  proc.emit({ type: 'agent_start' })
  proc.emit({ type: 'agent_end' })
  proc.emit({ type: 'agent_settled' })
  assert.equal(await next, 'end_turn')
})

test('PiAcpSession: a handled prompt starts the next queued one', async () => {
  const proc = new FakePiRpcProcess()
  proc.promptDisposition = 'handled'
  const session = makeSession(proc)

  const first = session.prompt('/my-command')
  const second = session.prompt('/other-command')
  assert.equal(await first, 'end_turn')
  assert.equal(await second, 'end_turn')
  assert.deepEqual(
    proc.prompts.map(p => p.message),
    ['/my-command', '/other-command']
  )
})

test('PiAcpSession: a handled command that started a run waits for it to settle', async () => {
  const proc = new FakePiRpcProcess()
  proc.promptDisposition = 'handled'
  const session = makeSession(proc)

  let settled = false
  // The command's own run begins before pi answers the prompt.
  const origPrompt = proc.prompt.bind(proc)
  proc.prompt = async (message: string, attachments: unknown[] = []) => {
    const disposition = await origPrompt(message, attachments)
    proc.emit({ type: 'agent_start' })
    return disposition
  }
  const turn = session.prompt('/run-something').then(reason => {
    settled = true
    return reason
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)

  proc.emit({ type: 'agent_end' })
  proc.emit({ type: 'agent_settled' })
  assert.equal(await turn, 'end_turn')
})
