import {
  methods,
  type AgentContext,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification
} from '@agentclientprotocol/sdk/unstable'

/** The client-side ACP calls the agent and its sessions make. */
export interface ClientConn {
  sessionUpdate(params: SessionNotification): Promise<void>
  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse>
}

export function clientConn(client: AgentContext): ClientConn {
  return {
    sessionUpdate: params => client.notify(methods.client.session.update, params),
    requestPermission: params => client.request(methods.client.session.requestPermission, params)
  }
}
