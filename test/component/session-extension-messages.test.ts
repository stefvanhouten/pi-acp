import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAcpSession } from '../../src/acp/session.js'
import { PiAcpAgent } from '../../src/acp/agent.js'
import { PiRpcProcess } from '../../src/pi-rpc/process.js'
import { FakeAgentSideConnection, FakePiRpcProcess, asAgentConn } from '../helpers/fakes.js'

function session() {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  new PiAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })
  return { conn, proc }
}

const tick = () => new Promise(r => setTimeout(r, 0))

test('PiAcpSession: shows a displayed custom message entry as a tool-call block', async () => {
  const { conn, proc } = session()
  proc.emit({
    type: 'entry_appended',
    entry: {
      type: 'custom_message',
      id: 'e1',
      customType: 'python-imports',
      content: 'Fix these imports',
      display: true,
      details: { acp: { title: 'Stop hook: python-imports', status: 'failed' } }
    }
  })
  await tick()

  assert.deepEqual(
    conn.updates.map(u => u.update),
    [
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'pi-extension-e1',
        title: 'Stop hook: python-imports',
        kind: 'other',
        status: 'in_progress'
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'pi-extension-e1',
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'Fix these imports' } }]
      }
    ]
  )
})

test('PiAcpSession: shows custom entries only when they carry data.acp.text', async () => {
  const { conn, proc } = session()
  proc.emit({ type: 'entry_appended', entry: { type: 'custom', id: 'e1', customType: 'pi-undo', data: { x: 1 } } })
  proc.emit({
    type: 'entry_appended',
    entry: { type: 'custom_message', id: 'e2', customType: 'hidden', content: 'x', display: false }
  })
  proc.emit({
    type: 'entry_appended',
    entry: { type: 'custom', id: 'e3', customType: 'python-imports', data: { acp: { text: 'No problems' } } }
  })
  await tick()

  const updates = conn.updates.map(u => u.update as any)
  assert.deepEqual(
    updates.map(u => [u.sessionUpdate, u.toolCallId, u.title, u.status]),
    [
      ['tool_call', 'pi-extension-e3', 'python-imports', 'in_progress'],
      ['tool_call_update', 'pi-extension-e3', undefined, 'completed']
    ]
  )
})

test('PiAcpAgent: loadSession replays displayed custom messages as blocks', async () => {
  const originalSpawn = PiRpcProcess.spawn
  ;(PiRpcProcess as any).spawn = async () =>
    ({
      onEvent: () => () => {},
      getMessages: async () => ({
        messages: [
          { role: 'custom', customType: 'python-imports', content: 'Fix it', display: true, timestamp: 5 },
          { role: 'custom', customType: 'secret', content: 'no', display: false, timestamp: 6 }
        ]
      }),
      getAvailableThinkingLevels: async () => ['medium'],
      getAvailableModels: async () => ({ models: [] }),
      getState: async () => ({ thinkingLevel: 'medium' })
    }) as any

  try {
    const conn = new FakeAgentSideConnection()
    const agent = new PiAcpAgent(asAgentConn(conn))
    ;(agent as any).store = {
      get: () => ({ sessionId: 's1', cwd: '/tmp/project', sessionFile: '/tmp/s.jsonl', updatedAt: '' }),
      upsert() {}
    }
    await agent.loadSession({ sessionId: 's1', cwd: '/tmp/project', mcpServers: [] } as any)

    const blocks = conn.updates
      .map(u => u.update as any)
      .filter(u => u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update')
    assert.deepEqual(
      blocks.map(u => [u.sessionUpdate, u.toolCallId]),
      [
        ['tool_call', 'pi-extension-python-imports-5'],
        ['tool_call_update', 'pi-extension-python-imports-5']
      ]
    )
    assert.equal(blocks[1].content[0].content.text, 'Fix it')
  } finally {
    PiRpcProcess.spawn = originalSpawn
  }
})
