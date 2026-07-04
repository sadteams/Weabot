import { loadPlugins } from '../../lib/load-plugins.js'
import {
    proto,
    generateWAMessageFromContent,
    areJidsSameUser
} from '@whiskeysockets/baileys';

/**
 * Handler untuk respon interaktif Baileys (button/list/interactive)
 * @param {Object} m - Message object dari Baileys
 * @param {Object} chatUpdate - Update dari Baileys
 * @param {Object} plugins - Object plugins yang udah di-load
 * @param {Object} opts - Opsi global (restrict, dll) 
 */
export async function all(m, chatUpdate, plugins, opts = {}) {
    try {
        if (m.isBaileys || !m.message) return

        const isInteractive = m.mtype === "interactiveResponseMessage"
        const isNativeFlow = !!m.message.nativeFlowResponseMessage
        const isButtons = !!m.message.buttonsResponseMessage
        const isTemplate = !!m.message.templateButtonReplyMessage
        const isList = !!m.message.listResponseMessage

        if (!(isInteractive || isNativeFlow || isButtons || isTemplate || isList)) return

        // Ambil id dari respon
        let id
        if (isButtons) {
            id = m.message.buttonsResponseMessage.selectedButtonId
        } else if (isTemplate) {
            id = m.message.templateButtonReplyMessage.selectedId
        } else if (isList) {
            id = m.message.listResponseMessage.singleSelectReply?.selectedRowId
        } else if (isInteractive || isNativeFlow) {
            try {
                const nativeFlow = m.message.interactiveResponseMessage?.nativeFlowResponseMessage
                    ?? m.message.nativeFlowResponseMessage
                id = JSON.parse(nativeFlow?.paramsJson || '{}')?.id
            } catch (e) {
                id = null
            }
        }

        // Ambil teks fallback
        let text = m.message.buttonsResponseMessage?.selectedDisplayText
            || m.message.templateButtonReplyMessage?.selectedDisplayText
            || m.message.listResponseMessage?.title
            || id

        if (!id && !text) return

        let isIdMessage = false, usedPrefix

        // Cek apakah id cocok dengan command plugin
        for (let name in plugins) {
            const plugin = plugins[name]
            if (!plugin || plugin.disabled || typeof plugin !== 'function' || !plugin.command) continue
            if (!opts['restrict'] && plugin.tags?.includes('admin')) continue

            const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
            const _prefix = plugin.customPrefix || this.prefix || global.prefix || ''

            const match = (
                _prefix instanceof RegExp ? [[_prefix.exec(id), _prefix]] :
                Array.isArray(_prefix) ? _prefix.map(p => {
                    const re = p instanceof RegExp ? p : new RegExp(str2Regex(p))
                    return [re.exec(id), re]
                }) :
                typeof _prefix === 'string' ? [[new RegExp(str2Regex(_prefix)).exec(id), new RegExp(str2Regex(_prefix))]] :
                [[[], new RegExp]]
            ).find(p => p[1])

            if ((usedPrefix = (match?.[0] || '')[0])) {
                const noPrefix = id.replace(usedPrefix, '')
                const [command] = noPrefix.trim().split` `.filter(Boolean)
                const cmd = (command || '').toLowerCase()

                const isId = plugin.command instanceof RegExp ? plugin.command.test(cmd) :
                    Array.isArray(plugin.command) ? plugin.command.some(c => c instanceof RegExp ? c.test(cmd) : c === cmd) :
                    typeof plugin.command === 'string' ? plugin.command === cmd : false

                if (isId) {
                    isIdMessage = true
                    break
                }
            }
        }

        const finalText = isIdMessage ? id : (text || id || '')
        if (!finalText) return

        // Bangun quoted object aman
        let quotedObj = null
        if (m.quoted?.fakeObj?.message) {
            try {
                const fakeObj = m.quoted.fakeObj
                const msgContent = { ...fakeObj.message }
                const msgType = Object.keys(msgContent)[0]

                if (msgType && typeof msgContent[msgType] === 'object') {
                    if (!msgContent[msgType].contextInfo) {
                        msgContent[msgType].contextInfo = {}
                    }
                    quotedObj = { ...fakeObj, message: msgContent }
                }
            } catch (e) {
                console.error('[Interactive] Failed to build quotedObj:', e)
            }
        }

        const messageOptions = {
            userJid: this.user.id,
            ...(quotedObj ? { quoted: quotedObj } : {})
        }

        const contentObj = {
            extendedTextMessage: {
                text: finalText,
                ...(m.mentionedJid?.length ? { contextInfo: { mentionedJid: m.mentionedJid } } : {})
            }
        }

        const messages = await generateWAMessageFromContent(m.chat, contentObj, messageOptions)
        messages.key.fromMe = areJidsSameUser(m.sender, this.user.id)
        messages.key.id = m.key.id
        messages.pushName = m.name
        if (m.isGroup) {
            messages.key.participant = messages.participant = m.sender
        }

        const msg = {
            ...chatUpdate,
            messages: [proto.WebMessageInfo.fromObject(messages)].map(v => (v.conn = this, v)),
            type: 'notify'
        }
        this.ev.emit('messages.upsert', msg)
    } catch (err) {
        console.error('[Interactive Handler] Error:', err)
    }
}