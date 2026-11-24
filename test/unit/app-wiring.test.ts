import test from 'node:test'
import assert from 'node:assert/strict'
import { client, methods, PROTOCOL_VERSION, RequestError, type ClientContext } from '@agentclientprotocol/sdk/unstable'
import { createPiAcpApp } from '../../src/acp/app.js'

async function withAgent<T>(op: (ctx: ClientContext) => Promise<T>): Promise<T> {
  const piAcp = createPiAcpApp()
  try {
    return await client({ name: 'test' }).connectWith(piAcp.app, op)
  } finally {
    piAcp.dispose()
  }
}

async function errorCode(promise: Promise<unknown>): Promise<number | undefined> {
  try {
    await promise
  } catch (err) {
    return err instanceof RequestError ? err.code : (err as any)?.code
  }
  assert.fail('expected the request to fail')
}

test('app: initialize advertises session list/delete and agent info', async () => {
  const res = await withAgent(ctx =>
    ctx.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
  )

  assert.equal(res.protocolVersion, 1)
  assert.equal(res.agentInfo?.name, 'pi-acp')
  assert.equal(res.agentCapabilities?.loadSession, true)
  assert.deepEqual(res.agentCapabilities?.sessionCapabilities, { list: {}, delete: {} })
})

test('app: session/set_model is routed although the schema dropped it', async () => {
  const code = await withAgent(async ctx => {
    await ctx.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
    return errorCode(ctx.request('session/set_model', { sessionId: 'no-such-session', modelId: 'x/y' }))
  })

  assert.notEqual(code, -32601, 'session/set_model must not be Method Not Found')
})

test('app: session/set_model rejects malformed params', async () => {
  const code = await withAgent(async ctx => {
    await ctx.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
    return errorCode(ctx.request('session/set_model', { sessionId: 's1' }))
  })

  assert.equal(code, -32602)
})

test('app: unknown methods are Method Not Found', async () => {
  const code = await withAgent(async ctx => {
    await ctx.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
    return errorCode(ctx.request('session/fork', { sessionId: 's1', cwd: process.cwd(), mcpServers: [] }))
  })

  assert.equal(code, -32601)
})
