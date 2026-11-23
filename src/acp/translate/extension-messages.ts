import type { SessionUpdate } from '@agentclientprotocol/sdk'
import { normalizePiMessageText } from './pi-messages.js'

/**
 * Show what extensions add to the session as ACP tool-call blocks.
 *
 * Pi's TUI renders a custom message with `display: true` (e.g. one a stop
 * hook adds at `agent_before_settle` to send the agent back) in the chat.
 * ACP has no such message kind, so pi-acp shows it as a completed tool call
 * of kind `other`, titled after the extension, with the message as its body.
 *
 * An extension can tune the block with `details.acp`
 * (`{ title?: string, status?: 'completed' | 'failed' }`), and can show a
 * block without adding anything to the model's context through a `custom`
 * entry whose `data.acp` also carries the body: `{ title?, status?, text }`
 * (e.g. a stop hook reporting that its check passed).  Those are only shown
 * live; Pi does not return custom entries with the session's messages.
 */

export interface ExtensionBlock {
  toolCallId: string
  title: string
  status: 'completed' | 'failed'
  text: string
}

function acpOptions(value: unknown): { title?: string; status?: string; text?: string } {
  const acp = (value as any)?.acp
  return acp && typeof acp === 'object' ? acp : {}
}

function block(id: string, customType: string, text: string, options: { title?: string; status?: string }) {
  return {
    toolCallId: `pi-extension-${id}`,
    title: typeof options.title === 'string' && options.title ? options.title : customType,
    status: options.status === 'failed' ? 'failed' : 'completed',
    text
  } satisfies ExtensionBlock
}

/** The block for a session entry from Pi's `entry_appended` event, if it has one. */
export function extensionBlockForEntry(entry: unknown): ExtensionBlock | undefined {
  const e = entry as any
  const id = String(e?.id ?? '')
  const customType = String(e?.customType ?? '')
  if (!id || !customType) return undefined

  if (e.type === 'custom_message' && e.display) {
    return block(id, customType, normalizePiMessageText(e.content), acpOptions(e.details))
  }
  if (e.type === 'custom') {
    const acp = acpOptions(e.data)
    if (typeof acp.text === 'string') return block(id, customType, acp.text, acp)
  }
  return undefined
}

/** The block for a replayed session message with role `custom`, if it has one. */
export function extensionBlockForMessage(message: unknown, fallbackId: string): ExtensionBlock | undefined {
  const m = message as any
  if (m?.role !== 'custom' || !m.display || typeof m.customType !== 'string') return undefined
  const id = m.timestamp !== undefined ? `${m.customType}-${m.timestamp}` : fallbackId
  return block(id, m.customType, normalizePiMessageText(m.content), acpOptions(m.details))
}

/** The ACP updates that render BLOCK: a tool call, then its completion with the body. */
export function extensionBlockUpdates(b: ExtensionBlock): SessionUpdate[] {
  return [
    {
      sessionUpdate: 'tool_call',
      toolCallId: b.toolCallId,
      title: b.title,
      kind: 'other',
      status: 'in_progress'
    },
    {
      sessionUpdate: 'tool_call_update',
      toolCallId: b.toolCallId,
      status: b.status,
      content: b.text ? [{ type: 'content', content: { type: 'text', text: b.text } }] : undefined
    }
  ]
}
