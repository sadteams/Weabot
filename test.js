import fs from 'fs'
import path, { dirname } from 'path'
import assert from 'assert'
import syntaxError from 'syntax-error'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

// Folder yang tidak perlu dicek
const ignoredFolders = new Set([
  'node_modules',
  '.git',
  'session',
  'sessions',
  'tmp',
  'temp',
  'logs',
  'log',
  'database/data'
])

// File yang tidak perlu dicek
const ignoredFiles = new Set([
  path.resolve(__filename)
])

// Cek apakah folder harus di-skip
function isIgnoredFolder(folderName, fullPath) {
  if (ignoredFolders.has(folderName)) return true

  const normalized = fullPath.replace(/\\/g, '/')

  for (const ignored of ignoredFolders) {
    if (normalized.includes(`/${ignored}/`) || normalized.endsWith(`/${ignored}`)) {
      return true
    }
  }

  return false
}

// Ambil semua file JS secara recursive
function scanJsFiles(targetPath, result = []) {
  if (!fs.existsSync(targetPath)) return result

  const stat = fs.statSync(targetPath)

  if (stat.isFile()) {
    if (targetPath.endsWith('.js')) {
      const resolved = path.resolve(targetPath)

      if (!ignoredFiles.has(resolved)) {
        result.push(resolved)
      }
    }

    return result
  }

  if (stat.isDirectory()) {
    const folderName = path.basename(targetPath)

    if (isIgnoredFolder(folderName, targetPath)) {
      return result
    }

    const items = fs.readdirSync(targetPath, {
      withFileTypes: true
    })

    for (const item of items) {
      const fullPath = path.join(targetPath, item.name)

      if (item.isDirectory()) {
        if (isIgnoredFolder(item.name, fullPath)) continue
        scanJsFiles(fullPath, result)
        continue
      }

      if (item.isFile() && item.name.endsWith('.js')) {
        const resolved = path.resolve(fullPath)

        if (!ignoredFiles.has(resolved)) {
          result.push(resolved)
        }
      }
    }
  }

  return result
}

// Ambil daftar folder dari package.json jika ada
function getFoldersFromPackageJson() {
  const packagePath = path.join(__dirname, 'package.json')

  if (!fs.existsSync(packagePath)) {
    return []
  }

  try {
    const pkg = require(packagePath)

    if (!pkg.directories || typeof pkg.directories !== 'object') {
      return []
    }

    return Object.values(pkg.directories)
      .filter(Boolean)
      .filter(value => typeof value === 'string')
  } catch (err) {
    console.error('Gagal membaca package.json:', err.message)
    return []
  }
}

// Target utama yang ingin dicek
let targets = [
  './config.js',
  './handler.js',
  './index.js',
  './lib',
  './database',
  './plugins',
  ...getFoldersFromPackageJson()
]

// Hilangkan duplikat
targets = [...new Set(targets)]

// Kumpulkan semua file JS
let files = []

for (const target of targets) {
  const fullPath = path.resolve(__dirname, target)
  files.push(...scanJsFiles(fullPath))
}

// Hilangkan duplikat file
files = [...new Set(files)]

if (files.length < 1) {
  console.log('Tidak ada file .js yang ditemukan untuk dicek.')
  process.exit(0)
}

console.log(`\nTotal file JS yang akan dicek: ${files.length}\n`)

let errorCount = 0
let successCount = 0
let errorFiles = []

for (const file of files) {
  console.error(`Checking ${file}`)

  let code = ''

  try {
    code = fs.readFileSync(file, 'utf8')
  } catch (err) {
    errorCount++

    errorFiles.push({
      file,
      error: err.message
    })

    console.error(`❌ Gagal membaca file: ${file}`)
    console.error(err.message)
    console.error('-----------------------------------')
    continue
  }

  const error = syntaxError(code, file, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true
  })

  if (error) {
    errorCount++

    errorFiles.push({
      file,
      error
    })

    console.error('\n❌ Syntax Error Found')
    console.error(`File: ${file}`)
    console.error(error)
    console.error('-----------------------------------\n')
    continue
  }

  successCount++
  console.log(`✅ Done ${file}`)
}

console.log('\n========== HASIL CEK ==========')
console.log(`✅ Berhasil dicek : ${successCount}`)
console.log(`❌ Error          : ${errorCount}`)
console.log(`📁 Total file     : ${files.length}`)
console.log('==============================\n')

if (errorFiles.length > 0) {
  console.log('Daftar file error:\n')

  for (const item of errorFiles) {
    console.log(`❌ ${item.file}`)
    console.log(item.error)
    console.log('-----------------------------------')
  }

  assert.fail(`${errorCount} file memiliki error`)
}

console.log('✅ Semua file aman, tidak ada syntax error.')