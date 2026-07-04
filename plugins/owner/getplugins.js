import fs from 'fs'
import syntaxError from 'syntax-error'
import path from 'path'
import { fileURLToPath } from 'url'

const _fs = fs.promises
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginsDir = path.join(__dirname, '..')

async function findFile(dir, filename) {
    const results = []
    try {
        const entries = await _fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
                const subResults = await findFile(fullPath, filename)
                results.push(...subResults)
            } else if (entry.name === filename) {
                results.push(fullPath)
            }
        }
    } catch {}
    return results
}

async function getAllPluginFiles(dir, baseDir) {
    const folderMap = {}
    try {
        const entries = await _fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
                await getAllPluginFilesInto(fullPath, baseDir, folderMap)
            }
        }
    } catch {}
    return folderMap
}

async function getAllPluginFilesInto(dir, baseDir, folderMap) {
    try {
        const entries = await _fs.readdir(dir, { withFileTypes: true })
        const jsFiles = []
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
                await getAllPluginFilesInto(fullPath, baseDir, folderMap)
            } else if (entry.name.endsWith('.js')) {
                jsFiles.push(entry.name)
            }
        }
        if (jsFiles.length > 0) {
            const relFolder = path.relative(baseDir, dir)
            folderMap[relFolder] = jsFiles
        }
    } catch {}
}

async function sendCodeMessage(conn, chat, quoted, filePath, fileContent) {
    const filename = path.basename(filePath)
    const ext = path.extname(filename).replace('.', '') || 'javascript'

    try {
        const { AIRich } = (await import('baileys-mbuilder')).default

        await new AIRich(conn)
            .setTitle(`📄 ${filename}`)
            .setFooter(`📁 ${filePath}`)
            .addCode(ext, fileContent)
            .send(chat, { quoted })
    } catch {
        await conn.sendMessage(chat, {
            disclaimerText: `📄 ${filename}`,
            headerText: `📂 ${filePath}`,
            code: `${fileContent}`,
            language: `javascript`,
        }, { quoted })
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        await m.reply(`Penggunaan: ${usedPrefix}${command} <name file>\nContoh: ${usedPrefix}getfile main.js\n        ${usedPrefix}getplugin owner-getfile`)
        return
    }

    if (/p(lugin)?/i.test(command)) {
        const filename = text.replace(/plugins?\//i, '') + (/\.js$/i.test(text) ? '' : '.js')

        if (text.includes('/')) {
            const pathFile = path.join(pluginsDir, text.replace(/plugin(s)\//i, ''))
            const file = await _fs.readFile(pathFile, 'utf8')

            await sendCodeMessage(conn, m.chat, m, path.relative(pluginsDir, pathFile), file)

            const error = syntaxError(file, filename, {
                sourceType: 'module',
                allowReturnOutsideFunction: true,
                allowAwaitOutsideFunction: true
            })
            if (error) {
                await m.reply(`⚠️ Error found in *${filename}*:\n\`\`\`\n${error}\n\`\`\``)
            }
        } else {
            const { key } = await conn.sendMessage(m.chat, {
                text: `🔍 Mencari *${filename}* di semua folder...`
            }, { quoted: m})

            const found = await findFile(pluginsDir, filename)

            if (found.length === 0) {
                const folderMap = await getAllPluginFiles(pluginsDir, pluginsDir)

                let listText = `❌ File *${filename}* tidak ditemukan!\n\nBerikut daftar file yang tersedia:`
                for (const [folder, files] of Object.entries(folderMap)) {
                    listText += `\n\n- *${folder}*\n`
                    listText += files.map(f => `  ${f}`).join('\n')
                }

                await conn.sendMessage(m.chat, { text: listText, edit: key }, {quoted: m})
                return
            }

            for (const filePath of found) {
                const relativePath = path.relative(pluginsDir, filePath)
                const file = await _fs.readFile(filePath, 'utf8')

                await conn.sendMessage(m.chat, {
                    text: `✅ File ditemukan!\n📁 Path: *${relativePath}*`,
                    edit: key
                }, {quoted:m})

                await sendCodeMessage(conn, m.chat, m, relativePath, file)

                const error = syntaxError(file, filePath, {
                    sourceType: 'module',
                    allowReturnOutsideFunction: true,
                    allowAwaitOutsideFunction: true
                })
                if (error) {
                    await m.reply(`⚠️ Error found in *${relativePath}*:\n\`\`\`\n${error}\n\`\`\``)
                }
            }
        }

    } else {
        const isJavascript = /\.js/.test(text)
        if (isJavascript) {
            const file = await _fs.readFile(text, 'utf8')

            await sendCodeMessage(conn, m.chat, m, text, file)

            const error = syntaxError(file, text, {
                sourceType: 'module',
                allowReturnOutsideFunction: true,
                allowAwaitOutsideFunction: true
            })
            if (error) {
                await m.reply(`⚠️ Error found in *${text}*:\n\`\`\`\n${error}\n\`\`\``)
            }
        } else {
            const file = await _fs.readFile(text, 'base64')
            await m.reply(Buffer.from(file, 'base64'))
        }
    }
}

handler.help = ['plugin', 'file'].map(v => `get${v} <name file>`)
handler.tags = ['owner']
handler.command = /^g(et)?(p(lugin)?|f(ile)?)$/i
handler.rowner = true

export default handler