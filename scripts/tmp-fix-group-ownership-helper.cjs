const fs = require('node:fs')

const file = 'scripts/tmp-group-ownership-transfer.cjs'
const source = fs.readFileSync(file, 'utf8')
const before = "      this.logger.error(`❌ [TransferGroupOwnership] Error: ${error.message}`);\\n"
const after = "      this.logger.error('❌ [TransferGroupOwnership] Error: ' + error.message);\\n"

if (!source.includes(before)) {
  throw new Error('Expected nested logger template not found')
}

fs.writeFileSync(file, source.replace(before, after))
