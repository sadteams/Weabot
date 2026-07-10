import { spawn } from 'child_process'
let handler = async (m, { conn }) => {
    await m.reply('🔄 Restarting bot...')
    spawn('npm', ['start'], { detached: true, stdio: 'ignore' })
    process.exit()
}
handler.command = ['restart']
handler.owner = true
export default handler