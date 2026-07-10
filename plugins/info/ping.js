import Connection from '../../lib/connection.js'
import { cpus as _cpus, totalmem, freemem } from 'os'
import { performance } from 'perf_hooks'

const format = (bytes = 0) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Number(bytes) || 0
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return size.toFixed(size >= 10 || unit === 0 ? 0 : 2) + ' ' + units[unit]
}

let handler = async (m, { conn }) => {
  const storeChats = Connection.store?.chats || global.store?.chats || {}
  const chats = Object.entries(storeChats).filter(([id, data]) => id && (data?.isChats ?? true))
  const groupsIn = chats.filter(([id]) => id.endsWith('@g.us'))
  const used = process.memoryUsage()
  const cpus = _cpus().map(cpu => {
    cpu.total = Object.keys(cpu.times).reduce((last, type) => last + cpu.times[type], 0)
    return cpu
  })
  const cpu = cpus.reduce((last, cpu, _, { length }) => {
    last.total += cpu.total
    last.speed += cpu.speed / length
    last.times.user += cpu.times.user
    last.times.nice += cpu.times.nice
    last.times.sys += cpu.times.sys
    last.times.idle += cpu.times.idle
    last.times.irq += cpu.times.irq
    return last
  }, {
    speed: 0,
    total: 0,
    times: {
      user: 0,
      nice: 0,
      sys: 0,
      idle: 0,
      irq: 0
    }
  })

  const old = performance.now()
  await m.reply('_Testing speed..._')
  const speed = performance.now() - old
  const memKeyWidth = Math.max(...Object.keys(used).map(key => key.length))
  const memoryUsage = Object.keys(used)
    .map(key => key.padEnd(memKeyWidth, ' ') + ': ' + format(used[key]))
    .join('\n')
  const cpuUsage = cpus[0]
    ? [
        '_Total CPU Usage_',
        cpus[0].model.trim() + ' (' + cpu.speed.toFixed(0) + ' MHZ)',
        ...Object.keys(cpu.times).map(type => '- *' + (type + '*').padEnd(6) + ': ' + (100 * cpu.times[type] / cpu.total).toFixed(2) + '%'),
        '',
        '_CPU Core(s) Usage (' + cpus.length + ' Core CPU)_',
        ...cpus.map((core, index) => [
          (index + 1) + '. ' + core.model.trim() + ' (' + core.speed + ' MHZ)',
          ...Object.keys(core.times).map(type => '- *' + (type + '*').padEnd(6) + ': ' + (100 * core.times[type] / core.total).toFixed(2) + '%')
        ].join('\n'))
      ].join('\n')
    : ''

  const text = [
    'Merespon dalam ' + speed.toFixed(2) + ' ms',
    '',
    'Status:',
    '- *' + groupsIn.length + '* Group Chats',
    '- *' + groupsIn.length + '* Groups Joined',
    '- *' + (chats.length - groupsIn.length) + '* Personal Chats',
    '- *' + chats.length + '* Total Chats',
    '',
    '*Server Info*:',
    'RAM: ' + format(totalmem() - freemem()) + ' / ' + format(totalmem()),
    '',
    '_NodeJS Memory Usage_',
    memoryUsage,
    '',
    cpuUsage
  ].filter(Boolean).join('\n')

  await m.reply(text)
}
handler.help = ['ping']
handler.tags = ['info', 'tools']
handler.command = /^(ping|info)$/i
export default handler
