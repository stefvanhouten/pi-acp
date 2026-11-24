import { agent, methods, RequestError, type AgentApp } from '@agentclientprotocol/sdk/unstable'
import { z } from 'zod'
import { PiAcpAgent } from './agent.js'
import { clientConn } from './client-conn.js'

// Dropped from the ACP schema, but clients such as acp.el still send it.
const SET_SESSION_MODEL = 'session/set_model'
const setSessionModelParams = z.object({ sessionId: z.string(), modelId: z.string() })

export type PiAcpApp = {
  app: AgentApp
  dispose(): void
}

/** Build the ACP agent app; one `PiAcpAgent` serves each connection. */
export function createPiAcpApp(): PiAcpApp {
  let pi: PiAcpAgent | undefined

  const current = (): PiAcpAgent => {
    if (!pi) throw RequestError.internalError({ details: 'pi-acp: no active connection' })
    return pi
  }

  const app = agent({ name: 'pi-acp' })
    .onConnect(connection => {
      pi = new PiAcpAgent(clientConn(connection.client))
    })
    .onRequest(methods.agent.initialize, ctx => current().initialize(ctx.params))
    .onRequest(methods.agent.authenticate, ctx => current().authenticate(ctx.params))
    .onRequest(methods.agent.session.new, ctx => current().newSession(ctx.params))
    .onRequest(methods.agent.session.load, ctx => current().loadSession(ctx.params))
    .onRequest(methods.agent.session.list, ctx => current().listSessions(ctx.params))
    .onRequest(methods.agent.session.delete, ctx => current().deleteSession(ctx.params))
    .onRequest(methods.agent.session.prompt, ctx => current().prompt(ctx.params))
    .onRequest(methods.agent.session.setMode, ctx => current().setSessionMode(ctx.params))
    .onRequest(methods.agent.session.setConfigOption, ctx => current().setSessionConfigOption(ctx.params))
    .onRequest(SET_SESSION_MODEL, setSessionModelParams, async ctx => {
      await current().unstable_setSessionModel(ctx.params)
      return {}
    })
    .onNotification(methods.agent.session.cancel, ctx => current().cancel(ctx.params))

  return { app, dispose: () => pi?.dispose() }
}
