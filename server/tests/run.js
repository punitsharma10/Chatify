// Backend test runner: starts the real server against a TEST database, runs every *.test.js, stops it.
//
//   Local:  TEST_MONGODB_URI=mongodb+srv://.../chatApp_test npm test
//   CI:     GitHub Actions provides a throwaway MongoDB (see .github/workflows/ci-cd.yml)
//
// Email/SMS are disabled while testing: codes are printed to the server log and the tests read them from there.
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PORT = 5055
const serverDir = path.join(__dirname, '..')
const logFile = path.join(os.tmpdir(), `chatify-test-server-${Date.now()}.log`)

const testUri = process.env.TEST_MONGODB_URI
if (!testUri) {
    console.error('Set TEST_MONGODB_URI to a test database (never your real one), e.g. .../chatApp_test')
    process.exit(1)
}
// safety: the database name must contain "test" so real data can't be touched by accident
const dbName = new URL(testUri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1)
if (!/test/i.test(dbName)) {
    console.error(`Refusing to run: database "${dbName}" doesn't look like a test database (name must contain "test").`)
    process.exit(1)
}

const env = {
    ...process.env,
    PORT : String(PORT),
    MONGODB_URI : testUri,
    JWT_SECRET_KEY : process.env.JWT_SECRET_KEY || 'test-secret',
    FRONTEND_URL : 'http://localhost:3001',
    NODE_ENV : 'test',
    // dotenv never overrides variables that already exist, so these keep real email/SMS off during tests
    SMTP_USER : '', SMTP_PASS : '', SMS_PROVIDER : '', SMS_OTP_LENGTH : '', SMS_MESSAGE_STYLE : '',
    OTP_LOG : logFile,
    // link-preview tests use a page on this machine (never allowed in production)
    LINK_PREVIEW_ALLOW_PRIVATE : '1',
    // scheduled messages / reminders are checked every second in tests
    SCHEDULER_TICK_MS : '1000',
    // Explore / Reels fill-up uses a fake Pexels server started by tests/explore.test.js
    PEXELS_API_KEY : 'test-key',
    PEXELS_API_BASE : 'http://localhost:5099',
    TEST_API : `http://localhost:${PORT}`
}

const log = fs.openSync(logFile, 'w')
const server = spawn(process.execPath, ['index.js'], { cwd : serverDir, env, stdio : ['ignore', log, log] })

const waitForServer = async () => {
    for (let i = 0; i < 120; i++) {
        if (fs.readFileSync(logFile, 'utf8').includes('connected to mongodb')) {
            // give the startup migration a moment
            await new Promise((r) => setTimeout(r, 1500))
            return
        }
        if (server.exitCode !== null) break
        await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('server did not start:\n' + fs.readFileSync(logFile, 'utf8').slice(-2000))
}

const runSuite = (file) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], { env, stdio : 'inherit' })
    child.on('exit', (code) => resolve(code === 0))
})

;(async () => {
    let ok = true
    try {
        await waitForServer()
        const suites = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort()
        for (const suite of suites) {
            console.log(`\n===== ${suite} =====`)
            if (!(await runSuite(suite))) ok = false
        }
    } catch (error) {
        console.error(error.message)
        ok = false
    } finally {
        server.kill()
    }
    console.log(ok ? '\nALL BACKEND TESTS PASSED' : '\nSOME BACKEND TESTS FAILED')
    process.exit(ok ? 0 : 1)
})()
