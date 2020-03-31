import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
/* eslint-disable */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
/* eslint-enable */

dotenv.config({
  path: path.join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env')
})
