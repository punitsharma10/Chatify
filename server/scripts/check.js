// Fast sanity check used by CI: every server file must parse, and every module must load.
// (Doesn't start the server or connect to a database.)
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const skip = new Set(['node_modules', 'tests'])

const files = []
const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes : true })) {
        if (skip.has(entry.name)) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.js')) files.push(full)
    }
}
walk(root)

let failed = 0
for (const file of files) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio : 'pipe' })
    } catch (error) {
        failed++
        console.error(`Syntax error in ${path.relative(root, file)}:\n${error.stderr}`)
    }
}

// load the app modules (routes pull in every controller/helper/model; socket pulls in the handlers)
for (const mod of ['routes/route.js', 'socket/index.js', 'helpers/migrate.js']) {
    try {
        require(path.join(root, mod))
    } catch (error) {
        failed++
        console.error(`Could not load ${mod}: ${error.message}`)
    }
}

console.log(failed ? `${failed} problem(s) found` : `OK: ${files.length} files parsed, app modules load`)
process.exit(failed ? 1 : 0)
